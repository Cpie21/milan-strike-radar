'use client';

export default function ErrorPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-[#f6f5f1] px-6 text-[#263d4d]">
      <section className="w-full max-w-md space-y-5" role="alert">
        <p className="text-sm">意大利罢工查询 · Italy Strike Query</p>
        <h1 className="text-2xl font-bold">罢工信息暂时无法更新</h1>
        <p className="leading-relaxed">官方数据源或同步服务暂时不可用。这不代表没有罢工，请稍后重试；出行前请核对运营商官方公告。</p>
        <p className="text-sm leading-relaxed" lang="en">Strike information is temporarily unavailable. This does not mean there are no strikes. Please check your transport operator’s official notices before travelling.</p>
        <div className="flex flex-wrap gap-4">
          <button type="button" onClick={() => window.location.reload()} className="rounded-xl bg-[#263d4d] px-5 py-3 text-white">重新加载 · Retry</button>
          <a href="https://scioperi.mit.gov.it/mit2/public/scioperi" className="px-1 py-3 underline">交通部官方公告 · Official notices</a>
        </div>
      </section>
    </main>
  );
}
