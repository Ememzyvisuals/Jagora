"use client";

/* Desktop: a frosted glass window over the sky. Tasks on the left, the live page in the middle, Jagora on the right. */
import { ArrowUp, Plus, UserCircle } from "@phosphor-icons/react";
import Link from "next/link";
import { useState } from "react";
import { ask, quick } from "@/lib/engine";
import { t } from "@/lib/i18n";
import { activeTask, useApp } from "@/lib/store";
import { Brand } from "../Brand";
import { AgentPanel } from "../AgentPanel";
import { PageView } from "../PageView";
import { LanguagePicker, QUICK, TaskRow } from "./Shared";

export function DesktopApp() {
  const task = useApp(activeTask);
  const tasks = useApp((s) => s.tasks);
  const setActive = useApp((s) => s.setActive);
  const profile = useApp((s) => s.profile);
  const showPage = task?.kind === "browse" && !!task.url;

  return (
    <div className="sky h-dvh p-4 xl:p-6" style={{ backgroundImage: "url(/sky/app.webp)" }}>
      <div className="glass flex h-full overflow-hidden rounded-[32px]">
        <aside className="flex w-[264px] shrink-0 flex-col border-r border-white/60 bg-white/25 p-4">
          <Brand href="/" />
          <button onClick={() => setActive(null)} className="btn btn-ink mt-6 h-11 w-full text-[15px]">
            <Plus size={16} weight="bold" /> New task
          </button>
          <p className="mt-6 px-1 text-[13px] font-medium text-ink-3">Tasks</p>
          <div className="no-scrollbar mt-2 flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
            {tasks.length ? (
              tasks.map((x) => (
                <div key={x.id} className={x.id === task?.id ? "rounded-[24px] ring-2 ring-accent/30" : ""}>
                  <TaskRow task={x} onOpen={() => setActive(x.id)} />
                </div>
              ))
            ) : (
              <p className="px-1 text-[14px] leading-snug text-ink-3">Your tasks will appear here.</p>
            )}
          </div>
          <div className="mt-3 flex items-center gap-2 border-t border-white/60 pt-3">
            <Link href="/app/details" className="flex min-w-0 flex-1 items-center gap-2 rounded-[14px] p-1.5 hover:bg-white/50">
              <UserCircle size={28} className="shrink-0 text-ink-2" />
              <span className="min-w-0">
                <span className="block truncate text-[14px] font-medium text-ink">{profile.full_name || "My details"}</span>
                <span className="block text-[12px] text-ink-3">Saved details</span>
              </span>
            </Link>
            <LanguagePicker compact />
          </div>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col p-3">{showPage ? <PageView /> : <Start />}</main>

        <section className="flex w-[400px] shrink-0 flex-col border-l border-white/60 bg-white/35">
          <AgentPanel orbSize={116} />
        </section>
      </div>
    </div>
  );
}

function Start() {
  const lang = useApp((s) => s.lang);
  const name = useApp((s) => s.profile.full_name.split(" ")[0]);
  const [text, setText] = useState("");
  const send = () => text.trim() && (ask(text.trim()), setText(""));
  const go = (id: (typeof QUICK)[number]["id"]) => {
    if (id === "register") ask(lang === "yo" ? "Forúkọ mi sílẹ̀ fún Skills Fair" : "Register me for the Skills Fair");
    if (id === "scam" || id === "paper") quick(id);
  };
  return (
    <div className="relative grid h-full place-items-center overflow-hidden rounded-[24px]">
      <div className="w-full max-w-[640px] px-8 text-center">
        <h1 className="text-[52px] font-semibold leading-[1.02] text-ink">
          {t("greet", lang)}
          {name ? `, ${name}` : ""}
        </h1>
        <p className="mt-3 text-[18px] text-ink-2">{t("ask", lang)}</p>
        <div className="glass-3 mx-auto mt-8 flex items-center gap-2 rounded-[26px] p-2 pl-6">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && send()}
            placeholder={t("typeHere", lang)}
            className="h-12 min-w-0 flex-1 bg-transparent text-[17px] outline-none placeholder:text-ink-3"
          />
          <button onClick={send} disabled={!text.trim()} className={`btn h-12 w-12 ${text.trim() ? "btn-ink" : "bg-ink/10 text-ink-3"}`} aria-label="Send">
            <ArrowUp size={19} weight="bold" />
          </button>
        </div>
        <div className="mx-auto mt-8 grid max-w-[520px] grid-cols-4 gap-3">
          {QUICK.map(({ id, Icon, label }) =>
            id === "details" ? (
              <Link key={id} href="/app/details" className="flex flex-col items-center gap-2 rounded-[22px] p-3 transition hover:bg-white/50">
                <Icon size={44} />
                <span className="text-[13.5px] font-medium text-ink-2">{label[lang]}</span>
              </Link>
            ) : (
              <button key={id} onClick={() => go(id)} className="flex flex-col items-center gap-2 rounded-[22px] p-3 transition hover:bg-white/50">
                <Icon size={44} />
                <span className="text-[13.5px] font-medium text-ink-2">{label[lang]}</span>
              </button>
            ),
          )}
        </div>
      </div>
    </div>
  );
}
