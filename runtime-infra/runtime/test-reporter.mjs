// Runs in the trusted Node test-runner parent. Model stdout is never parsed as TAP.
export default async function* reporter(events) {
  for await (const event of events) {
    if (event.type === 'test:summary' && event.data.file === undefined) {
      yield JSON.stringify({ counts: event.data.counts, success: event.data.success }) + '\n';
    }
  }
}
