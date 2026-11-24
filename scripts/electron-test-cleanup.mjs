export async function bounded(work, timeoutMs, label) {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(work),
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${label} timed out after ${timeoutMs}ms`)),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

// Only the isolated Electron process created by this test is ever terminated.
export async function closeTestApplication(application, timeoutMs = 5000) {
  try {
    await bounded(() => application.close(), timeoutMs, 'Electron test cleanup');
    return true;
  } catch (error) {
    console.error(error.message);
    application.process().kill();
    await bounded(
      () => application.close().catch(() => {}),
      timeoutMs,
      'Electron test process termination',
    ).catch((terminationError) => console.error(terminationError.message));
    return false;
  }
}
