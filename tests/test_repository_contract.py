from html.parser import HTMLParser
from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]


class StructureParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.tags = set()
        self.ids = set()

    def handle_starttag(self, tag, attrs):
        self.tags.add(tag)
        self.ids.update(value for key, value in attrs if key == "id" and value)


class RepositoryContractTests(unittest.TestCase):
    def test_required_files_exist(self):
        for relative_path in (
            "index.html",
            "t/index.html",
            "docs/00_PRODUCT_SPEC.md",
        ):
            path = ROOT / relative_path
            self.assertTrue(path.is_file(), f"missing required file: {relative_path}")
            self.assertGreater(path.stat().st_size, 100, f"file is unexpectedly small: {relative_path}")

    def test_entrypoints_have_basic_html_structure(self):
        for relative_path in ("index.html", "t/index.html"):
            content = (ROOT / relative_path).read_text(encoding="utf-8")
            parser = StructureParser()
            parser.feed(content)
            self.assertIn("html", parser.tags, relative_path)
            self.assertIn("script", parser.tags, relative_path)
            self.assertTrue(
                "canvas" in parser.tags or "svg" in parser.tags,
                f"{relative_path} must include a handwriting surface",
            )

    def test_no_unresolved_merge_markers(self):
        candidates = list(ROOT.glob("*.html")) + list((ROOT / "t").glob("*.html"))
        candidates += list((ROOT / "docs").glob("*.md"))
        for path in candidates:
            content = path.read_text(encoding="utf-8")
            for marker in ("<<<<<<< ", "=======\n", ">>>>>>> "):
                self.assertNotIn(marker, content, str(path.relative_to(ROOT)))

    def test_product_spec_contains_non_negotiable_boundaries(self):
        spec = (ROOT / "docs/00_PRODUCT_SPEC.md").read_text(encoding="utf-8")
        for phrase in (
            "54 位獨立參與者",
            "不設定年齡限制",
            "不得要求使用者輸入 VAS",
            "低／中／高",
            "新增 96 位參與者",
            "balanced accuracy",
            "不得稱為已驗證模型",
        ):
            self.assertIn(phrase, spec)


if __name__ == "__main__":
    unittest.main()
