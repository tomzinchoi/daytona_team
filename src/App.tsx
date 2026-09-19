import { useEffect, useRef, useState } from 'react';
import { ArrowRight, ArrowUpRight, Box, Check, ChevronRight, CircleDot, Command, Cpu, FlaskConical, GitBranch, Layers3, Play, Plus, Radio, Server, Sparkles, Target, Terminal, X, Zap } from 'lucide-react';
import BenchmarkSpace from './components/BenchmarkSpace';
import ConfigurationDetail, { EvidenceBadge, Selection } from './components/ConfigurationDetail';
import { benchmarkApi, apiConfigured } from './api/client';
import { demoSnapshot, DEMO_WORKLOAD } from './data/demo';
import { resourceLabel, topologyLabel, type Configuration, type Snapshot } from './domain';

type Screen = 'workload' | 'search' | 'benchmark' | 'results' | 'recommendations' | 'selection' | 'providers';
const navigation: { id: Screen; label: string; icon: typeof Box; number: string }[] = [
  { id: 'workload', label: 'Workload', icon: Terminal, number: '01' },
  { id: 'search', label: 'Architecture search', icon: GitBranch, number: '02' },
  { id: 'benchmark', label: 'Controlled benchmark', icon: FlaskConical, number: '03' },
  { id: 'results', label: 'Benchmark space', icon: Box, number: '04' },
  { id: 'recommendations', label: 'Recommendations', icon: Target, number: '05' },
  { id: 'selection', label: 'Your configuration', icon: Layers3, number: '06' },
  { id: 'providers', label: 'Providers', icon: Server, number: '07' },
];
export default function App() {
  const [screen, setScreen] = useState<Screen>('workload'); const [workload, setWorkload] = useState('');
  const [snapshot, setSnapshot] = useState<Snapshot>(() => demoSnapshot(DEMO_WORKLOAD, 'search'));
  const [selectedId, setSelectedId] = useState('08'); const [production, setProduction] = useState<Configuration | null>(null);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [runStarted, setRunStarted] = useState(false);
  const [showProtocol, setShowProtocol] = useState(false); const [pollingStopped, setPollingStopped] = useState(false);
  const generation = useRef(0);
  const demo = snapshot.source === 'demo';
  const selected = snapshot.configurations.find(c => c.id === selectedId) ?? snapshot.configurations[0];
  const candidates = snapshot.configurations.filter(c => c.selectedForBenchmark);
  const measured = snapshot.configurations.filter(c => c.evidence === 'measured');
  const recommendations = (['performance', 'balanced', 'efficient'] as const).map(role => ({ role, config: snapshot.configurations.find(c => c.recommendation === role) })).filter((entry): entry is { role: 'performance' | 'balanced' | 'efficient'; config: Configuration } => Boolean(entry.config));

  useEffect(() => {
    if (demo || snapshot.phase !== 'benchmark' || pollingStopped) return;
    let cancelled = false; let timer: ReturnType<typeof setTimeout>;
    const token = generation.current;
    async function poll() {
      try { const next = await benchmarkApi.get(snapshot.id); if (cancelled || token !== generation.current) return; setSnapshot(next); if (next.phase === 'results') setScreen('results'); else timer = setTimeout(poll, 2000); }
      catch (e) { if (!cancelled && token === generation.current) { setError(e instanceof Error ? e.message : 'Unable to refresh benchmark.'); setPollingStopped(true); } }
    }
    timer = setTimeout(poll, 2000); return () => { cancelled = true; clearTimeout(timer); };
  }, [demo, snapshot.id, snapshot.phase, pollingStopped]);

  async function begin(useDemo: boolean) {
    const value = useDemo ? DEMO_WORKLOAD : workload.trim();
    if (!value) { setError('Describe a recurring workload to continue.'); return; }
    const token = ++generation.current; setError(''); setBusy(true); setProduction(null); setPollingStopped(false);
    try {
      const result = useDemo ? demoSnapshot(value, 'search') : await benchmarkApi.create(value);
      if (token !== generation.current) return; setSnapshot(result); setWorkload(value); setRunStarted(true); setSelectedId(result.configurations.find(c => c.selectedForBenchmark)?.id ?? result.configurations[0].id); setScreen(result.phase === 'search' ? 'search' : result.phase === 'benchmark' ? 'benchmark' : 'results');
    } catch (e) { if (token === generation.current) setError(e instanceof Error ? e.message : 'Unable to start the benchmark.'); }
    finally { if (token === generation.current) setBusy(false); }
  }
  async function advance() {
    setError(''); const token = generation.current;
    if (demo) { const phase = snapshot.phase === 'search' ? 'benchmark' : 'results'; setSnapshot(demoSnapshot(snapshot.workload, phase)); setScreen(phase); if (phase === 'results') setSelectedId('08'); return; }
    setBusy(true);
    try { const next = await benchmarkApi.start(snapshot.id); if (token === generation.current) { setSnapshot(next); setScreen(next.phase); setPollingStopped(false); } }
    catch (e) { if (token === generation.current) setError(e instanceof Error ? e.message : 'Unable to start controlled benchmark.'); }
    finally { if (token === generation.current) setBusy(false); }
  }
  function reset() { generation.current++; setSnapshot(demoSnapshot(DEMO_WORKLOAD, 'search')); setScreen('workload'); setRunStarted(false); setProduction(null); setWorkload(''); setError(''); setBusy(false); setPollingStopped(false); }
  function choose(config: Configuration) { setProduction(config); setScreen('selection'); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  function canVisit(id: Screen) { return id === 'workload' || id === 'providers' || id === 'selection' && Boolean(production) || runStarted && (id === 'search' || id === 'results' || id === 'benchmark' && snapshot.phase !== 'search' || id === 'recommendations' && snapshot.phase === 'results'); }
  const headings: Record<Screen, [string, string]> = {
    workload: ['Evidence before deployment.', 'Benchmark open models on your real workload before you deploy them.'],
    search: ['Explore the possibilities.', 'One workload. Multiple models, agent architectures, and compute configurations.'],
    benchmark: ['Same workload. Controlled conditions.', 'Move from model predictions to benchmark evidence.'],
    results: ['Your workload. Every trade-off.', 'Explore the space between quality, latency, and resources.'],
    recommendations: ['The right trade-off is yours.', 'Best among evaluated configurations. Choose what matters to your workload.'],
    selection: ['Ready for your next step.', 'A complete configuration, with the evidence behind your choice.'],
    providers: ['Infrastructure, in the open.', 'A clear view of what is connected and what powers each part of the workflow.'],
  };
  return <div className="app-shell">
    <aside className="sidebar"><a href="#" className="brand" onClick={e => { e.preventDefault(); reset(); }}><span className="brand-mark">A</span><strong>atlas<span> /</span></strong></a><div className="workspace-switch"><span className="workspace-icon"><Command size={15}/></span><div>Personal workspace<small>Configuration intelligence</small></div><ChevronRight size={13}/></div><div className="nav-label">WORKBENCH</div><nav aria-label="Main navigation">{navigation.map(({ id, label, icon: Icon, number }) => <button key={id} disabled={!canVisit(id)} className={screen === id ? 'active' : ''} onClick={() => setScreen(id)}><Icon size={16}/><span>{label}</span><small>{number}</small></button>)}</nav><button className="new-benchmark" onClick={reset}><Plus size={16}/>New benchmark</button><div className="sidebar-bottom"><div className="runtime-mini"><span className="status-dot"/><span>Daytona runtime</span><small>{snapshot.providers.find(p => p.name.toLowerCase() === 'daytona')?.connected ? 'CONNECTED' : 'OFFLINE'}</small></div><p>Less guesswork.<br/>Better configurations.</p><span className="mono dim">ATLAS / HACKATHON EDITION</span></div></aside>
    <div className="main-shell"><header className="topbar"><div className="breadcrumbs">Workspace<ChevronRight size={13}/><span>{navigation.find(n => n.id === screen)?.label}</span></div><div className="topbar-right"><span className={`badge ${demo ? 'demo' : 'api'}`}><span className="status-dot"/>{demo ? 'DEMO ENVIRONMENT' : 'API CONNECTED'}</span><span className="avatar">AW</span></div></header>
      <main><div className="page-heading"><div><div className="eyebrow"><span className="mini-cross">+</span>MODEL × ARCHITECTURE × COMPUTE</div><h1>{headings[screen][0]}</h1><p>{headings[screen][1]}</p></div><button className="text-button" onClick={() => setShowProtocol(true)}>Benchmark protocol<ArrowUpRight size={14}/></button></div>
        {error && <div className="error-banner" role="alert"><span>{error}</span>{pollingStopped && <button onClick={() => { setError(''); setPollingStopped(false); }}>Retry status</button>}<button aria-label="Dismiss error" onClick={() => setError('')}><X size={16}/></button></div>}
        {demo && <div className="demo-strip"><span><span className="status-dot"/><strong>DEMO DATA</strong><span className="divider">/</span>Daytona not connected. {screen === 'benchmark' ? 'Statuses below are illustrative, not live execution.' : 'Explore an illustrative benchmark, step by step.'}</span><span className="mono">NO LIVE EXECUTION</span></div>}

        {screen === 'workload' && <><div className="workload-grid"><section className="workload-card panel"><div className="section-number">01 / DEFINE YOUR WORKLOAD</div><h2>What AI task do you<br/>run repeatedly?</h2><p>Find the configuration that earns its place in your stack.</p><form onSubmit={e => { e.preventDefault(); if (apiConfigured) void begin(false); else { setError('A benchmark API is not connected. Use the one-click example to explore explicitly labeled demo data.'); } }}><label htmlFor="workload" className="sr-only">Recurring workload</label><textarea id="workload" value={workload} onChange={e => setWorkload(e.target.value)} placeholder="Describe your task, expected output, and what success looks like…" maxLength={8000}/><button className="button primary full" type="submit" disabled={busy}>{busy ? 'Connecting…' : 'Benchmark my workload'}<ArrowRight size={16}/></button></form><div className="or-rule"><span/>OR TRY AN EXAMPLE<span/></div><button className="demo-example" onClick={() => void begin(true)} disabled={busy}><span className="example-icon"><Terminal size={19}/></span><span><strong>Repository bug fixes</strong><small>{DEMO_WORKLOAD}</small></span><ArrowUpRight size={16}/></button><p className="workload-explanation">We test multiple AI configurations against representative tasks under controlled conditions.</p></section><BenchmarkSpace configurations={snapshot.configurations} selected={selected.id} onSelect={setSelectedId} source={snapshot.source}/></div><div className="principles"><div><GitBranch size={18}/><span><strong>Explore the architecture</strong><small>Models, roles, and compute. Together.</small></span></div><div><FlaskConical size={18}/><span><strong>Measure the real trade-offs</strong><small>Controlled tasks. Explainable evidence.</small></span></div><div><Target size={18}/><span><strong>Choose with confidence</strong><small>Your priorities decide the configuration.</small></span></div></div></>}

        {runStarted && screen !== 'workload' && screen !== 'providers' && screen !== 'selection' && <div className="run-summary"><div className="run-workload"><Terminal size={17}/><div><span className="eyebrow">RECURRING WORKLOAD</span><strong>{snapshot.workload}</strong></div></div><div className="run-stat"><strong>{snapshot.configurations.length.toString().padStart(2, '0')}</strong><span>explored</span></div><div className="run-stat"><strong>{candidates.length.toString().padStart(2, '0')}</strong><span>selected</span></div><div className="run-stat"><strong className="lime">{measured.length.toString().padStart(2, '0')}</strong><span>{demo ? 'demo results' : 'measured'}</span></div></div>}

        {screen === 'search' && <><section className="search-panel panel"><header className="section-header"><div><span className="eyebrow">02 / ARCHITECTURE SEARCH</span><h2>{snapshot.configurations.length} configurations explored.</h2><p>Top {candidates.length} selected for {demo ? 'the illustrative benchmark' : 'live benchmark'}.</p></div><button className="button primary" onClick={() => void advance()} disabled={busy || snapshot.phase !== 'search'}>{busy ? 'Starting…' : demo ? 'Preview benchmark stages' : 'Start Daytona benchmark'}<ArrowRight size={15}/></button></header><div className="candidate-grid">{snapshot.configurations.map(c => <button key={c.id} className={`candidate ${c.selectedForBenchmark ? 'shortlisted' : ''} ${selectedId === c.id ? 'inspected' : ''}`} onClick={() => setSelectedId(c.id)}><div><span className="mono">#{c.id}</span>{c.selectedForBenchmark ? <span className="shortlist-label"><Check size={12}/>SHORTLISTED</span> : <span className="mono dim">PREDICTED</span>}</div><strong>{topologyLabel(c)}</strong><span>{c.quality}% quality <i/> {c.latency}s latency</span></button>)}</div></section><div className="results-grid"><BenchmarkSpace configurations={snapshot.configurations} selected={selected.id} onSelect={setSelectedId} source={snapshot.source}/><ConfigurationDetail config={selected} demo={demo} onUse={choose}/></div></>}

        {screen === 'benchmark' && <><section className="benchmark-panel panel"><header className="section-header"><div><span className="eyebrow">03 / CONTROLLED BENCHMARK</span><h2>Powered by <span className="daytona-wordmark">Daytona<span>▰</span></span></h2><p>{demo ? 'Static demo stages. Advance to reveal illustrative results.' : 'Status is reported directly by the benchmark API.'}</p></div>{demo ? <button className="button primary" onClick={() => void advance()}>Reveal demo results<ArrowRight size={16}/></button> : <span className="badge api"><Radio size={12}/>{pollingStopped ? 'UPDATES PAUSED' : 'API STATUS'}</span>}</header><div className="benchmark-cards">{candidates.map(c => <article key={c.id}><span className="mono dim">{c.name.toUpperCase()}</span><h3>{topologyLabel(c)}</h3><div className={`stage-status ${c.status}`}><CircleDot size={14}/>{demo ? 'DEMO · ' : ''}{c.status.toUpperCase()}</div><div className="stage-track">{['provisioning', 'running', 'evaluating', 'completed'].map((s, i) => <span key={s} className={['provisioning', 'running', 'evaluating', 'completed'].indexOf(c.status) >= i ? 'done' : ''}/>)}</div><small>{c.error ?? c.compute}</small></article>)}</div><div className="protocol-inline"><FlaskConical size={14}/>{snapshot.protocol}</div></section><div className="results-grid"><BenchmarkSpace configurations={snapshot.configurations} selected={selected.id} onSelect={setSelectedId} source={snapshot.source}/><ConfigurationDetail config={selected} demo={demo} onUse={choose}/></div></>}

        {(screen === 'results' || screen === 'recommendations') && <><div className="results-grid"><BenchmarkSpace configurations={snapshot.configurations} selected={selected.id} onSelect={setSelectedId} source={snapshot.source}/><ConfigurationDetail config={selected} demo={demo} onUse={choose}/></div><section className="recommendations"><header className="recommendation-heading"><div><span className="eyebrow">FIND YOUR OPERATING POINT</span><h2>Three ways forward<span>.</span></h2></div><p>Best among evaluated configurations.</p></header>{recommendations.length ? <div className="recommendation-grid">{recommendations.map(({ role, config }) => <article key={role} className={`recommendation-card ${role}`}><div className="recommendation-top"><span>{role === 'performance' ? <Zap size={15}/> : role === 'balanced' ? <Target size={15}/> : <Cpu size={15}/>}<strong>{role.toUpperCase()}</strong></span>{role === 'balanced' && <span className="suggested">SUGGESTED</span>}</div><h3>{config.name}</h3><p>{topologyLabel(config)}</p><div className="recommendation-metrics"><div><strong>{config.quality}<small>%</small></strong><span>Quality</span></div><div><strong>{config.latency}<small>s</small></strong><span>Latency</span></div><div><strong>{config.resource.value.toFixed(2)}</strong><span>{config.resource.unit}{config.resource.estimated ? ' est.' : ''}</span></div></div><EvidenceBadge config={config} demo={demo}/><button className={`button full ${role === 'balanced' ? 'primary' : 'secondary'}`} onClick={() => choose(config)}>Use this configuration<ArrowUpRight size={15}/></button></article>)}</div> : <div className="empty-state panel"><FlaskConical/><h3>Evidence comes first.</h3><p>Recommendations appear when the benchmark API returns them.</p><button className="button secondary" onClick={() => setScreen(snapshot.phase === 'search' ? 'search' : 'benchmark')}>Continue benchmark<ArrowRight size={15}/></button></div>}<p className="evidence-note">{demo ? 'Illustrative results. ' : ''}Quality is defined in each configuration’s evidence breakdown. Resource estimates are not billing costs. Pareto membership and recommendations are supplied by {demo ? 'the demo fixture' : 'the API'}.</p></section></>}
        {screen === 'selection' && production && <Selection config={production} demo={demo} onBack={() => setScreen('results')}/>}
        {screen === 'providers' && <section className="provider-grid">{snapshot.providers.map((p, i) => <article className="provider-card panel" key={p.name}><span className="provider-logo">{i === 0 ? '▰' : i === 1 ? 'N' : 'D'}</span><span className="eyebrow">{p.role.toUpperCase()}</span><h2>{p.name}</h2><span className={`badge ${p.connected ? 'api' : 'offline'}`}><span className="status-dot"/>{p.connected ? 'LIVE' : 'NOT CONNECTED'}</span><p>{p.connected ? 'Connection reported by the benchmark API.' : 'No active integration is reported. This provider is not executing work.'}</p></article>)}</section>}
        <footer className="page-footer"><span><span className="mini-cross">+</span> BUILT FOR EVIDENCE, NOT GUESSWORK.</span><button onClick={() => setScreen('providers')}>Infrastructure status<ArrowUpRight size={12}/></button><span>ATLAS v0.1</span></footer>
      </main>
    </div>
    {showProtocol && <div className="modal-backdrop" onClick={() => setShowProtocol(false)}><section className="protocol-modal panel" role="dialog" aria-modal="true" aria-labelledby="protocol-title" onClick={e => e.stopPropagation()} onKeyDown={e => { if (e.key === 'Escape') setShowProtocol(false); }}><button autoFocus className="modal-close" aria-label="Close protocol" onClick={() => setShowProtocol(false)}><X size={20}/></button><FlaskConical size={25}/><h2 id="protocol-title">Benchmark protocol</h2><p>{snapshot.protocol}</p><ul><li>Each point represents a complete model, agent architecture, and compute configuration.</li><li>Translucent points are predictions. Solid points carry measured evidence; demo results remain labeled.</li><li>Quality includes a weighted breakdown. Latency is reported in seconds.</li><li>Resource estimates use a shared unit and are not provider pricing.</li><li>Pareto membership and recommendations come from the backend or the isolated fixture.</li></ul><button className="button primary" onClick={() => setShowProtocol(false)}>Got it<Check size={15}/></button></section></div>}
  </div>;
}
