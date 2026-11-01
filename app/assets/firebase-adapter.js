/* Dormant existing-service bridge. No SDK initialization, authentication, config, or automatic I/O. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./storage.js'));else root.CWFirebaseAdapter=factory(root.CWStore);})(globalThis,function(S){
  'use strict';
  const safePart=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(value);
  function create(db,auth){
    const uid=auth?.currentUser?.uid;
    if(!safePart(uid)||!db||typeof db.ref!=='function')throw Error('既有登入與資料庫尚未就緒，未啟動任何連線');
    const identity=()=>{if(auth.currentUser?.uid!==uid)throw Error('登入狀態已改變，停止此筆同步');};
    const ref=id=>{identity();if(!safePart(id))throw Error('session ID 格式不符');return db.ref('users/'+uid+'/sessions/'+id);};
    return {
      async put(id,record){if(record.id!==id||record.schema!=='cw-writing/1.0')throw Error('摘要識別或版本不符');const item=S.clean(record);await ref(id).set(item);identity();return {id,confirmed:true};},
      async remove(id){await ref(id).remove();identity();return {id,confirmed:true};}
    };
  }
  return {create};
});
