from html.parser import HTMLParser
from pathlib import Path
import re
import shutil
import subprocess
import unittest


ROOT = Path(__file__).resolve().parents[1]
PRODUCT = ROOT / "Calm_Writing_V18.html"


class IdParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.ids = []

    def handle_starttag(self, _tag, attrs):
        self.ids.extend(value for key, value in attrs if key == "id" and value)


class V18RegressionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.html = PRODUCT.read_text(encoding="utf-8")

    def test_single_file_product_has_unique_ids(self):
        parser = IdParser()
        parser.feed(self.html)
        duplicates = sorted({value for value in parser.ids if parser.ids.count(value) > 1})
        self.assertEqual([], duplicates)

    def test_inline_javascript_parses(self):
        node = shutil.which("node")
        if not node:
            self.skipTest("node is unavailable")
        scripts = re.findall(r"<script(?:\s[^>]*)?>([\s\S]*?)</script>", self.html, re.I)
        inline = "\n".join(script for script in scripts if script.strip())
        result = subprocess.run(
            [node, "--check", "-"],
            input=inline.encode("utf-8"),
            capture_output=True,
            check=False,
        )
        self.assertEqual(0, result.returncode, result.stderr.decode("utf-8", errors="replace"))

    def test_offline_startup_and_local_dates_are_explicit(self):
        self.assertIn("typeof window.firebase !== 'undefined'", self.html)
        self.assertIn("activateLocalMode", self.html)
        self.assertIn("function localDateKey", self.html)
        self.assertNotRegex(self.html, r"new Date\(\)\.toISOString\(\)\.slice\(0,\s*10\)")

    def test_registered_negative_spacing_bug_is_fixed(self):
        segment = re.search(r"function segmentChars\(\)([\s\S]*?)\n}\n\nfunction analyzeWriting", self.html)
        self.assertIsNotNone(segment)
        body = segment.group(1)
        self.assertIn("for(const pt of rp)", body)
        self.assertNotIn("strokeXCtr", body)
        self.assertNotIn("strokeToChar", body)
        self.assertIn("gap>=0", self.html)

    def test_missing_sensor_values_are_not_fabricated(self):
        self.assertIn("const avgPressure=pv.length?", self.html)
        self.assertIn(":null;", self.html)
        self.assertIn("pressure:measured===null?null", self.html)
        self.assertIn("emotion_result:        result.dataSufficient ? result.dominant : null", self.html)

    def test_empty_sessions_duplicate_submit_and_random_feedback_are_blocked(self):
        self.assertIn("sessionData.rawPoints||[]).length<3", self.html)
        self.assertIn("if(finishInProgress) return", self.html)
        show_feedback = re.search(r"function showFeedback\(\)([\s\S]*?)\n}\n\nlet toastTimer", self.html)
        self.assertIsNotNone(show_feedback)
        self.assertNotIn("Math.random", show_feedback.group(1))

    def test_user_content_is_escaped_and_mood_listeners_are_single_owned(self):
        self.assertIn("function escapeHtml", self.html)
        self.assertIn("${escapeHtml(s.text)}", self.html)
        self.assertNotIn("querySelector(`.br-bubble[data-word=", self.html)
        self.assertIn("moodBubbleListenerActive", self.html)
        self.assertIn("stopBrMoodListener", self.html)

    def test_touch_resize_and_accessibility_regressions_are_covered(self):
        self.assertNotIn("if(e.pointerType==='touch') return", self.html)
        self.assertIn("function resizeCanvases(preserveDrawing=true)", self.html)
        self.assertIn("prepareInteractiveElements", self.html)
        self.assertIn("prefers-reduced-motion", self.html)
        self.assertIn("aria-live=\"polite\"", self.html)

    def test_known_broken_copy_is_removed(self):
        for fragment in ("情很平靜", " es ", "心情 is", "滿死生機", "書寫達人’"):
            self.assertNotIn(fragment, self.html)

    def test_research_t6_contains_spacing_fix_and_correct_version(self):
        body = (ROOT / "t" / "Calm_Writing_T6.html").read_text(encoding="utf-8")
        self.assertIn("const APP_VERSION = 'T6';", body)
        self.assertNotIn("strokeXCtr", body)
        self.assertNotIn("strokeToChar", body)
        self.assertIn("for (const pt of rp)", body)
        self.assertIn("if (gap >= 0) spacings.push(gap);", body)

    def test_research_t6_inline_javascript_parses(self):
        node = shutil.which("node")
        if not node:
            self.skipTest("node is unavailable")
        body = (ROOT / "t" / "Calm_Writing_T6.html").read_text(encoding="utf-8")
        scripts = re.findall(r"<script(?:\s[^>]*)?>([\s\S]*?)</script>", body, re.I)
        inline = "\n".join(script for script in scripts if script.strip())
        result = subprocess.run(
            [node, "--check", "-"],
            input=inline.encode("utf-8"),
            capture_output=True,
            check=False,
        )
        self.assertEqual(0, result.returncode, result.stderr.decode("utf-8", errors="replace"))

    def test_public_entrypoints_match_the_fixed_versions(self):
        self.assertEqual(PRODUCT.read_bytes(), (ROOT / "index.html").read_bytes())
        self.assertEqual(
            (ROOT / "t" / "Calm_Writing_T6.html").read_bytes(),
            (ROOT / "t" / "index.html").read_bytes(),
        )


if __name__ == "__main__":
    unittest.main()
