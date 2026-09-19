import { useEffect, useState } from 'react';
import { LoaderCircle } from 'lucide-react';
export default function AnalysisProgress({ running }: { running: boolean }) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const start = Date.now();
    const timer = setInterval(() => setSeconds(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(timer);
  }, []);
  return <section className="analysis-progress" aria-label="분석 진행 상태" aria-busy="true">
    <div className="analysis-orbit"><LoaderCircle size={26} /></div>
    <div><strong role="status">{running ? '벤치마크 실행 및 평가 중' : '워크로드 분석 요청 처리 중'}</strong>
      <p>{running ? '모델 실행과 테스트 결과를 기다리고 있습니다.' : '입력한 작업을 전달하고 실행 구성을 확인하고 있습니다.'} 응답이 도착하면 자동으로 갱신됩니다.</p>
      <div className="indeterminate-track" aria-hidden="true"><span /></div>
    </div><span className="elapsed">{seconds}초 경과</span>
  </section>;
}
