type TopBarProps = {
  title: string;
  rightText?: string;
};

export function TopBar({ title, rightText }: TopBarProps) {
  return (
    <header className="topbar">
      <div>
        <p className="topbar__brand">AI销货单助手</p>
        <h1>{title}</h1>
      </div>
      {rightText ? <span className="topbar__meta">{rightText}</span> : null}
    </header>
  );
}
