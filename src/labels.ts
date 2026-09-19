export function labelKo(value: string): string {
  const labels: Record<string, string> = { predicted: '예측', measured: '실측', performance: '품질 우선', balanced: '균형', efficient: '효율 우선', queued: '대기 중', provisioning: '환경 준비 중', running: '실행 중', evaluating: '평가 중', completed: '완료', failed: '실패', planner: '계획 담당', implementer: '구현 담당', reviewer: '검토 담당' };
  if (value === 'illustrative') return '예시';
  return labels[value.toLowerCase()] ?? value;
}
