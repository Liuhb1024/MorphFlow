import Link from "next/link";

export default function NotFoundPage() {
  return (
    <main className="system-page">
      <p className="system-page__eyebrow">MORPHFLOW / 404</p>
      <h1>这个本地项目不存在</h1>
      <p>它可能已被移除，或者不属于当前本地项目库。</p>
      <Link href="/projects">返回创作空间</Link>
    </main>
  );
}
