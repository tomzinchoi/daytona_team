import recordedText from '../../backend/results_live.jsonl?raw';
import { parseHumanEval } from '../humaneval';
import LivePerformance from './LivePerformance';

const rows = parseHumanEval(recordedText);
const recordedRun = { id: 'backend/results_live.jsonl', status: 'completed', total: rows.length, rows };

export default function RecordedPerformance({ onDetails }: { onDetails: () => void }) {
  return <div className="workbench-performance">
    <LivePerformance run={recordedRun} source="recorded" />
    <button className="button secondary" onClick={onDetails}>문제별 실측 근거와 생성 코드 보기</button>
  </div>;
}
