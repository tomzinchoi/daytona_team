import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/gateway.mjs';

async function invoke(url, { method = 'GET', body, headers = {} } = {}) {
  const response = { headers: {}, setHeader(k,v) { this.headers[k]=v; }, end(value) { this.body=JSON.parse(value); } };
  await handler({ url, method, body, headers: { host:'atlas.example', ...headers } }, response);
  return response;
}
test('deployment gateway restricts routes, keeps auth server-side, and preserves API failures', async () => {
  const prior = globalThis.fetch;
  const env = {...process.env};
  Object.assign(process.env, { RUNTIME_API_URL:'https://runtime.example', ENGINE_API_URL:'https://engine.example', RUNTIME_API_TOKEN:'runtime-secret', RUNTIME_PREVIEW_TOKEN:'preview-secret', NOSANA_API_KEY:'nos_test' });
  const calls=[];
  globalThis.fetch = async (url, init) => {
    calls.push({url:String(url),init});
    if(String(url).includes('inference.nosana.com')) return Response.json({data:[{id:'model'}]});
    if(String(url).endsWith('/api/providers')) return Response.json({providers:[{id:'daytona',status:'LIVE',reason:'Verified'},{id:'nosana',status:'NOT_CONFIGURED'}]});
    return Response.json({error:{code:'SNAPSHOT_NOT_CONFIGURED',message:'Snapshot missing'}},{status:503});
  };
  try {
    let response=await invoke('/runtime/api/providers');
    assert.equal(response.statusCode,200);
    assert.equal(response.body.providers[1].status,'LIVE');
    assert.equal(response.body.providers[1].capabilities.benchmark,false);
    assert.equal(calls[0].init.headers.Authorization,'Bearer runtime-secret');
    assert.equal(calls[0].init.headers['X-Daytona-Preview-Token'],'preview-secret');
    assert.ok(!JSON.stringify(response).includes('secret'));
    response=await invoke('/api/gateway?service=runtime&path=workloads/example',{method:'POST',headers:{origin:'https://atlas.example'}});
    assert.equal(response.statusCode,503);
    assert.equal(response.body.error.code,'SNAPSHOT_NOT_CONFIGURED');
    const count=calls.length;
    response=await invoke('/runtime/api/workloads/example',{method:'POST',headers:{origin:'https://evil.example'}});
    assert.equal(response.statusCode,403); assert.equal(calls.length,count);
    response=await invoke('/api/gateway?service=runtime&path=../../secrets');
    assert.equal(response.statusCode,404); assert.equal(calls.length,count);
    globalThis.fetch=async()=>{throw new Error('private upstream details')};
    response=await invoke('/runtime/api/providers');
    assert.equal(response.statusCode,502);
    assert.ok(!JSON.stringify(response).includes('private upstream'));
  } finally { globalThis.fetch=prior; process.env=env; }
});
