import {createRequire} from 'node:module';
import {readFile,writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
const {Daytona}=createRequire(new URL('../runtime-infra/package.json',import.meta.url))('@daytona/sdk');
const state=JSON.parse(await readFile('.vercel/backend-state.json','utf8'));
const d=new Daytona({apiKey:process.env.DAYTONA_API_KEY,otelEnabled:false});
try {
const box=await d.get(state.sandboxId);
if(state.liveUrl){const health=await fetch(state.liveUrl+'/health',{headers:{Authorization:'Bearer '+state.runtimeToken,'X-Daytona-Preview-Token':state.previewToken},signal:AbortSignal.timeout(10000)});if(health.ok&&(await health.json()).active)throw Error('Live benchmark is active; wait for completion before updating.');}
const stopped=await box.process.executeCommand("pkill -TERM -f '^node --env-file=../runtime.env live-server.mjs$' || true",'/home/daytona/atlas/runtime-infra',undefined,20);
if(stopped.exitCode!==0)throw Error('Could not stop previous idle live server');
await box.fs.createFolder('/home/daytona/atlas/backend','700');
await box.fs.uploadFile(await readFile('backend/humaneval_all.json'),'/home/daytona/atlas/backend/humaneval_all.json');
const source=await readFile('backend/bench.py','utf8');const models=JSON.parse(source.match(/MODELS = (\{[\s\S]*?\n\})/)[1].replace(/,\s*}/g,'}'));
await box.fs.uploadFile(Buffer.from(JSON.stringify(models)),'/home/daytona/atlas/backend/live-models.json');
await box.fs.uploadFile(await readFile('scripts/live-server.mjs'),'/home/daytona/atlas/runtime-infra/live-server.mjs');
const session='live-'+Date.now();await box.process.createSession(session);await box.process.executeSessionCommand(session,{command:'cd /home/daytona/atlas/runtime-infra && node --env-file=../runtime.env live-server.mjs',runAsync:true});
const preview=await box.getPreviewLink(3003);
state.liveUrl=preview.url;await writeFile('.vercel/backend-state.json',JSON.stringify(state));
const r=spawnSync('cmd.exe',['/d','/s','/c','pnpm dlx vercel env add LIVE_API_URL production --sensitive --yes --force'],{input:preview.url,encoding:'utf8',windowsHide:true});if(r.status!==0)throw Error('Environment setup failed');console.log('Live server and Vercel environment ready');
}finally{await d[Symbol.asyncDispose]();}
