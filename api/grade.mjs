import {Daytona} from '@daytona/sdk';
import {readFile} from 'node:fs/promises';
import {randomUUID,createHash,timingSafeEqual} from 'node:crypto';
const digest=value=>createHash('sha256').update(value).digest();
export default async function handler(req,res){
 const send=(status,body)=>{res.statusCode=status;res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(body));};
 if(req.method!=='POST'||!process.env.RUNTIME_API_TOKEN||!timingSafeEqual(digest(req.headers.authorization||''),digest('Bearer '+process.env.RUNTIME_API_TOKEN)))return send(401,{error:'Unauthorized'});
 const {sandboxId,taskId,code}=req.body??{};
 if(!/^[a-f0-9-]{36}$/.test(sandboxId??'')||typeof code!=='string'||code.length>100000||!['HumanEval/53','HumanEval/23','HumanEval/45','HumanEval/7'].includes(taskId))return send(400,{error:'Invalid grading request'});
 const client=new Daytona({apiKey:process.env.DAYTONA_API_KEY,otelEnabled:false});
 try{
  const all=JSON.parse(await readFile(new URL('../backend/humaneval_all.json',import.meta.url),'utf8'));
  const p=all.find(p=>p.task_id===taskId);const box=await client.get(sandboxId);const marker='ATLAS_CHECK_'+randomUUID();
  await box.fs.uploadFile(Buffer.from(code+'\n'+p.test+'\ncheck('+p.entry_point+')\nprint('+JSON.stringify(marker)+')\n'),'/tmp/atlas-case.py');
  const result=await box.process.executeCommand('timeout 12s python3 -I /tmp/atlas-case.py',undefined,undefined,15);
  return send(200,{passed:result.exitCode===0&&result.result.includes(marker),exitCode:result.exitCode});
 }catch{return send(502,{error:'Isolated grading service failed'});}finally{await client[Symbol.asyncDispose]();}
}
