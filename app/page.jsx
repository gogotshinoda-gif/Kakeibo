"use client";
import React, { useState, useMemo, useRef, useEffect } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend, Cell
} from "recharts";

const CATS = {
  "食べる": { emoji: "🍓", color: "#F4A7B9" },
  "移動する": { emoji: "🚃", color: "#A8C8E8" },
  "楽しむ": { emoji: "🎀", color: "#E8B7D4" },
  "習い事": { emoji: "🎹", color: "#FFD6A5" },
  "その他": { emoji: "🌷", color: "#C9B8E8" },
};
const CAT_NAMES = Object.keys(CATS);

const yen = (n) => "¥" + Number(n).toLocaleString("ja-JP");
const today = () => new Date().toISOString().slice(0, 10);

async function askClaude(prompt, model) {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, model }),
  });
  const data = await res.json();
  return data.text;
}

function parseJSON(text) {
  const clean = text.replace(/```json|```/g, "").trim();
  const start = clean.indexOf(clean.trimStart()[0] === "[" ? "[" : "{");
  return JSON.parse(clean.slice(start >= 0 ? start : 0));
}

export default function App() {
  const [txs, setTxs] = useState([]);
  const [tab, setTab] = useState("home");
  const [chatLog, setChatLog] = useState([
    { from: "ai", text: "こんにちは🐰 「コンビニ500」みたいに、ゆるっと教えてくださいね🌸" },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [csvText, setCsvText] = useState("");
  const [csvBusy, setCsvBusy] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfResult, setPdfResult] = useState("");
  const [monthComment, setMonthComment] = useState("");
  const [commentBusy, setCommentBusy] = useState(false);
  const chatEnd = useRef(null);
  const pdfInputRef = useRef(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("kakeibo-txs");
      if (saved) setTxs(JSON.parse(saved));
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem("kakeibo-txs", JSON.stringify(txs));
    } catch {}
  }, [txs]);

  useEffect(() => {
    chatEnd.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatLog]);

  const thisMonth = today().slice(0, 7);
  const monthTxs = useMemo(
    () => txs.filter((t) => t.date.startsWith(thisMonth)),
    [txs, thisMonth]
  );
  const total = monthTxs.reduce((s, t) => s + t.amount, 0);
  const byCat = useMemo(() => {
    const m = Object.fromEntries(CAT_NAMES.map((c) => [c, 0]));
    monthTxs.forEach((t) => {
      m[CATS[t.category] ? t.category : "その他"] += t.amount;
    });
    return m;
  }, [monthTxs]);
  const ramen = Math.floor(total / 900);

  const trendData = useMemo(() => {
    const map = {};
    txs.forEach((t) => {
      const ym = t.date.slice(0, 7);
      if (!map[ym]) map[ym] = { month: ym, 合計: 0, ...Object.fromEntries(CAT_NAMES.map(c => [c, 0])) };
      const cat = CATS[t.category] ? t.category : "その他";
      map[ym][cat] += t.amount;
      map[ym]["合計"] += t.amount;
    });
    return Object.values(map).sort((a, b) => a.month.localeCompare(b.month)).slice(-12);
  }, [txs]);

  // ── チャット入力 ──
  async function sendChat() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setChatLog((l) => [...l, { from: "me", text }]);
    setBusy(true);
    try {
      const raw = await askClaude(
        `あなたは家計簿アプリのアシスタントです。ユーザーの入力から支出を抽出してください。
今日の日付: ${today()}

【カテゴリ判定ガイド】
- 食べる：食事、食べ物、飲食、カフェ、ランチ、ディナー、コンビニ、レストラン、スーパー、弁当、飲み物
- 移動する：交通、タクシー、バス、電車、ガソリン、駐車場、新幹線、飛行機
- 楽しむ：映画、コンサート、イベント、娯楽、エンタメ、展示会、アミューズメント、ゲーム、旅行、温泉
- 習い事：レッスン、教室、勉強、塾、スクール、講座、ジム、フィットネス
- その他：上記以外すべて（日用品、医療、美容、洋服など）

カテゴリは必ず次の5つのどれか: 食べる / 移動する / 楽しむ / 習い事 / その他
入力: "${text}"

JSONのみで返答（前置き・コードブロック禁止）:
{"transactions":[{"date":"YYYY-MM-DD","amount":数値,"category":"...","memo":"短い説明"}],"reply":"やさしく肯定的なひと言（絵文字1つOK、責めない）"}
金額が含まれていれば必ず transactions に追加してください。支出が読み取れなければ transactions は空配列にして、reply で優しく聞き返してください。`,
        "claude-haiku-4-5-20251001"
      );
      const parsed = parseJSON(raw);
      const adds = (parsed.transactions || []).map((t) => ({
        ...t,
        id: Math.random().toString(36).slice(2),
        category: CATS[t.category] ? t.category : "その他",
        amount: Math.abs(Number(t.amount) || 0),
        date: t.date || today(),
      })).filter((t) => t.amount > 0);
      if (adds.length) setTxs((p) => [...adds, ...p]);
      setChatLog((l) => [
        ...l,
        { from: "ai", text: parsed.reply || "記録しました！", added: adds },
      ]);
    } catch {
      setChatLog((l) => [
        ...l,
        { from: "ai", text: "うまく読み取れませんでした🙏 「ランチ 800円」のように書いてみてください。" },
      ]);
    }
    setBusy(false);
  }

  // ── CSV取込 ──
  async function importCSV() {
    if (!csvText.trim() || csvBusy) return;
    setCsvBusy(true);
    try {
      const raw = await askClaude(
        `銀行明細やCSVの貼り付けデータから「支出」だけを抽出して家計簿に変換してください（入金・振込受取は除外）。

【カテゴリ判定ガイド】
- 食べる：食事、飲食、カフェ、コンビニ、スーパー、レストラン
- 移動する：交通、タクシー、バス、電車、ガソリン、駐車場
- 楽しむ：映画、娯楽、エンタメ、旅行、アミューズメント
- 習い事：レッスン、教室、スクール、ジム
- その他：上記以外

カテゴリは必ず次の5つのどれか: 食べる / 移動する / 楽しむ / 習い事 / その他
データ:
${csvText.slice(0, 6000)}

JSON配列のみで返答（前置き・コードブロック禁止）:
[{"date":"YYYY-MM-DD","amount":数値,"category":"...","memo":"店名など"}]`,
        "claude-haiku-4-5-20251001"
      );
      const arr = parseJSON(raw);
      const adds = (Array.isArray(arr) ? arr : []).map((t) => ({
        ...t,
        id: Math.random().toString(36).slice(2),
        category: CATS[t.category] ? t.category : "その他",
        amount: Math.abs(Number(t.amount) || 0),
        date: t.date || today(),
      })).filter((t) => t.amount > 0);
      setTxs((p) => [...adds, ...p]);
      setCsvText("");
      setChatLog((l) => [
        ...l,
        { from: "ai", text: `CSVから ${adds.length} 件を取り込みました📥 おつかれさまです、それだけで十分えらい！` },
      ]);
      setTab("home");
    } catch {
      alert("読み取れませんでした。日付・金額・内容が含まれるデータを貼り付けてください。");
    }
    setCsvBusy(false);
  }

  // ── PDF取込 ──
  async function importPDF(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPdfBusy(true);
    setPdfResult("");
    try {
      const base64 = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result.split(",")[1]);
        r.onerror = () => rej(new Error("読み込み失敗"));
        r.readAsDataURL(file);
      });
      const res = await fetch("/api/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ base64 }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      const adds = (Array.isArray(data.transactions) ? data.transactions : []).map((t) => ({
        ...t,
        id: Math.random().toString(36).slice(2),
        category: CATS[t.category] ? t.category : "その他",
        amount: Math.abs(Number(t.amount) || 0),
        date: t.date || today(),
      })).filter((t) => t.amount > 0);
      setTxs((p) => [...adds, ...p]);
      setPdfResult(`✅ ${adds.length} 件を取り込みました！`);
      setChatLog((l) => [
        ...l,
        { from: "ai", text: `みずほ銀行の明細から ${adds.length} 件を取り込みました🏦 おつかれさまです！` },
      ]);
      setTab("home");
    } catch (err) {
      setPdfResult("❌ 読み取れませんでした。みずほ銀行のPDF明細か確認してください。");
    }
    setPdfBusy(false);
    if (pdfInputRef.current) pdfInputRef.current.value = "";
  }

  // ── 月コメント ──
  async function genComment() {
    if (commentBusy) return;
    setCommentBusy(true);
    try {
      const summary = CAT_NAMES.map((c) => `${c}: ${byCat[c]}円`).join(", ");
      const text = await askClaude(
        `家計簿アプリのやさしいAIです。今月の支出を見て、責めずに肯定ベースで2〜3文のコメントを日本語で書いてください。数字の羅列ではなく気づきを。絵文字1〜2個OK。
今月合計: ${total}円 / 内訳: ${summary} / 件数: ${monthTxs.length}件
コメント本文のみ返答。`,
        "claude-sonnet-4-20250514"
      );
      setMonthComment(text.trim());
    } catch {
      setMonthComment("今月も記録できていて、それだけで十分すばらしいです🌱");
    }
    setCommentBusy(false);
  }

  const maxCat = Math.max(...CAT_NAMES.map((c) => byCat[c]), 1);

  return (
    <div style={S.app}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Zen+Maru+Gothic:wght@400;500;700&display=swap');
        * { box-sizing: border-box; }
        button { font-family: inherit; cursor: pointer; }
        textarea, input { font-family: inherit; }
        ::placeholder { color: #D4B8BC; }
      `}</style>

      <header style={S.header}>
        <div style={{ fontSize: 22, fontWeight: 700, color: "#A05A6E" }}>🐰 がんばらない家計簿</div>
        <div style={{ fontSize: 12, color: "#C08A97", marginTop: 2 }}>サボってもいい。思い出したときに、ゆるっと🌸</div>
      </header>

      <nav style={S.nav}>
        {[
          ["home", "🏠 ホーム"],
          ["chat", "💬 入力"],
          ["csv", "📥 CSV"],
          ["pdf", "📄 PDF"],
          ["trend", "📊 推移"],
          ["list", "📒 履歴"],
        ].map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)}
            style={{ ...S.tabBtn, ...(tab === k ? S.tabActive : {}) }}>
            {label}
          </button>
        ))}
      </nav>

      <main style={S.main}>
        {tab === "home" && (
          <div>
            <div style={S.card}>
              <div style={{ fontSize: 13, color: "#C08A97" }}>今月つかったお金</div>
              <div style={{ fontSize: 40, fontWeight: 700, lineHeight: 1.2, color: "#8A4A5E" }}>{yen(total)}</div>
              {total > 0 && <div style={{ fontSize: 13, color: "#D49AAB", marginTop: 4 }}>ラーメンだいたい {ramen} 杯ぶん 🍜</div>}
            </div>
            <div style={S.card}>
              <div style={S.cardTitle}>内訳（ざっくり5つだけ）</div>
              {CAT_NAMES.map((c) => (
                <div key={c} style={{ margin: "10px 0" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                    <span>{CATS[c].emoji} {c}</span>
                    <span style={{ fontWeight: 700 }}>{yen(byCat[c])}</span>
                  </div>
                  <div style={{ height: 10, background: "#FBE9ED", borderRadius: 99, marginTop: 4 }}>
                    <div style={{ height: "100%", width: `${(byCat[c] / maxCat) * 100}%`, background: CATS[c].color, borderRadius: 99, transition: "width .4s" }} />
                  </div>
                </div>
              ))}
            </div>
            <div style={{ ...S.card, background: "#FDF0F4", border: "1.5px dashed #F2C6D2" }}>
              <div style={S.cardTitle}>🐰 うさぎからのひと言</div>
              {monthComment
                ? <p style={{ margin: "6px 0 12px", lineHeight: 1.7, fontSize: 14 }}>{monthComment}</p>
                : <p style={{ margin: "6px 0 12px", color: "#C08A97", fontSize: 13 }}>記録がたまったら、やさしいコメントをもらえます🌸</p>}
              <button onClick={genComment} disabled={commentBusy || monthTxs.length === 0} style={S.btnPink}>
                {commentBusy ? "考え中…" : "コメントをもらう"}
              </button>
            </div>
          </div>
        )}

        {tab === "chat" && (
          <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
            <div style={{ flex: 1, overflowY: "auto", padding: "4px 2px" }}>
              {chatLog.map((m, i) => (
                <div key={i} style={{ display: "flex", justifyContent: m.from === "me" ? "flex-end" : "flex-start", margin: "8px 0" }}>
                  <div style={m.from === "me" ? S.bubbleMe : S.bubbleAi}>
                    {m.text}
                    {m.added?.length > 0 && (
                      <div style={{ marginTop: 6, fontSize: 12, color: "#B5708A" }}>
                        {m.added.map((a) => <div key={a.id}>✓ {CATS[a.category].emoji} {a.memo} {yen(a.amount)}</div>)}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {busy && <div style={{ ...S.bubbleAi, color: "#C08A97" }}>かきかき…✏️</div>}
              <div ref={chatEnd} />
            </div>
            <div style={{ display: "flex", gap: 8, paddingTop: 8 }}>
              <input value={input} onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && sendChat()}
                placeholder="例：コンビニ500 / 昨日 映画 1900円"
                style={S.input} />
              <button onClick={sendChat} disabled={busy} style={S.btnPink}>送る</button>
            </div>
          </div>
        )}

        {tab === "csv" && (
          <div style={S.card}>
            <div style={S.cardTitle}>銀行CSV・明細の貼り付け</div>
            <p style={{ fontSize: 13, color: "#C08A97", lineHeight: 1.7 }}>
              銀行アプリやネットバンキングからダウンロードしたCSVの中身、または明細のコピペをそのまま貼り付けてください。AIが支出だけを選んで自動分類します。
            </p>
            <textarea value={csvText} onChange={(e) => setCsvText(e.target.value)}
              placeholder={"2026/06/01, セブンイレブン, 540\n2026/06/02, JR東日本, 1280\n..."}
              style={S.textarea} />
            <button onClick={importCSV} disabled={csvBusy || !csvText.trim()} style={{ ...S.btnPink, marginTop: 10 }}>
              {csvBusy ? "AIが仕分け中…" : "取り込む"}
            </button>
          </div>
        )}

        {tab === "pdf" && (
          <div style={S.card}>
            <div style={S.cardTitle}>📄 みずほ銀行PDF明細の取込</div>
            <p style={{ fontSize: 13, color: "#C08A97", lineHeight: 1.7 }}>
              みずほ銀行のネットバンキングからダウンロードしたPDF明細をアップロードしてください。AIが支出だけを自動で読み取って分類します。
            </p>
            <div style={{ marginTop: 12 }}>
              <label style={{
                display: "inline-block", background: "#FDF0F4",
                border: "2px dashed #F2C6D2", borderRadius: 14,
                padding: "20px 24px", cursor: "pointer", textAlign: "center",
                width: "100%", color: "#C08A97", fontSize: 14,
              }}>
                {pdfBusy ? "AIが読み取り中…🔍" : "📄 PDFファイルを選択"}
                <input ref={pdfInputRef} type="file" accept=".pdf"
                  onChange={importPDF} style={{ display: "none" }} disabled={pdfBusy} />
              </label>
            </div>
            {pdfResult && (
              <div style={{ marginTop: 12, padding: "10px 14px", background: "#FDF0F4", borderRadius: 12, fontSize: 14, color: "#A05A6E" }}>
                {pdfResult}
              </div>
            )}
            <div style={{ marginTop: 16, padding: "10px 14px", background: "#FBF5FF", borderRadius: 12, fontSize: 12, color: "#9B7EC8" }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>📋 対応しているPDF</div>
              <div>・みずほ銀行 入出金明細（PDF形式）</div>
              <div>・ネットバンキングからダウンロードしたもの</div>
            </div>
          </div>
        )}

        {tab === "trend" && (
          <div>
            {trendData.length === 0 ? (
              <div style={{ ...S.card, textAlign: "center", padding: 32 }}>
                <div style={{ fontSize: 36 }}>🌸</div>
                <p style={{ color: "#C08A97", fontSize: 13, marginTop: 8 }}>記録が増えると月別の推移グラフが表示されます</p>
              </div>
            ) : (
              <>
                <div style={S.card}>
                  <div style={S.cardTitle}>📊 月別 合計支出</div>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={trendData} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#FBE9ED" />
                      <XAxis dataKey="month" tickFormatter={(v) => v.slice(5) + "月"} tick={{ fontSize: 11, fill: "#C08A97" }} />
                      <YAxis tickFormatter={(v) => v >= 10000 ? (v / 10000) + "万" : v} tick={{ fontSize: 10, fill: "#C08A97" }} />
                      <Tooltip formatter={(v) => ["¥" + v.toLocaleString(), "合計"]} labelFormatter={(l) => l + " の支出"} contentStyle={{ borderRadius: 12, border: "1px solid #F6D8E0", fontSize: 12 }} />
                      <Bar dataKey="合計" radius={[8, 8, 0, 0]}>
                        {trendData.map((_, i) => <Cell key={i} fill={_.month === thisMonth ? "#E89BB0" : "#F4C5D3"} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                  {trendData.length >= 2 && (() => {
                    const last = trendData[trendData.length - 2]["合計"];
                    const curr = trendData[trendData.length - 1]["合計"];
                    const diff = curr - last;
                    return <div style={{ fontSize: 12, color: diff > 0 ? "#C08A97" : "#88B08A", marginTop: 8, textAlign: "right" }}>先月比 {diff > 0 ? "+" : ""}{yen(diff)} {diff > 0 ? "📈" : "📉"}</div>;
                  })()}
                </div>
                <div style={S.card}>
                  <div style={S.cardTitle}>🎀 カテゴリ別の推移</div>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={trendData} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#FBE9ED" />
                      <XAxis dataKey="month" tickFormatter={(v) => v.slice(5) + "月"} tick={{ fontSize: 11, fill: "#C08A97" }} />
                      <YAxis tickFormatter={(v) => v >= 10000 ? (v / 10000) + "万" : v} tick={{ fontSize: 10, fill: "#C08A97" }} />
                      <Tooltip formatter={(v, name) => ["¥" + v.toLocaleString(), name]} contentStyle={{ borderRadius: 12, border: "1px solid #F6D8E0", fontSize: 12 }} />
                      <Legend formatter={(v) => CATS[v]?.emoji + " " + v} wrapperStyle={{ fontSize: 11 }} />
                      {CAT_NAMES.map((c) => <Bar key={c} dataKey={c} stackId="a" fill={CATS[c].color} radius={c === "その他" ? [8, 8, 0, 0] : [0, 0, 0, 0]} />)}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div style={S.card}>
                  <div style={S.cardTitle}>🗓 月ごとのまとめ</div>
                  {[...trendData].reverse().map((d) => (
                    <div key={d.month} style={{ ...S.row, flexWrap: "wrap", gap: 6 }}>
                      <div style={{ fontWeight: 700, fontSize: 13, width: 60, color: d.month === thisMonth ? "#E89BB0" : "#7A5560" }}>
                        {d.month.slice(5)}月
                        {d.month === thisMonth && <span style={{ fontSize: 10, marginLeft: 4, color: "#E89BB0" }}>今月</span>}
                      </div>
                      <div style={{ flex: 1, fontWeight: 700, fontSize: 14 }}>{yen(d["合計"])}</div>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {CAT_NAMES.filter(c => d[c] > 0).map(c => (
                          <span key={c} style={{ fontSize: 11, background: CATS[c].color + "33", color: "#7A5560", padding: "2px 8px", borderRadius: 99 }}>
                            {CATS[c].emoji} {yen(d[c])}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {tab === "list" && (
          <div style={S.card}>
            <div style={S.cardTitle}>履歴（{txs.length}件）</div>
            {txs.length === 0 && <p style={{ color: "#C08A97", fontSize: 13 }}>まだ記録がありません。気が向いたときでOKです🌷</p>}
            {txs.map((t) => (
              <div key={t.id} style={S.row}>
                <span style={{ fontSize: 18 }}>{CATS[t.category].emoji}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.memo}</div>
                  <div style={{ fontSize: 11, color: "#C08A97" }}>{t.date}・{t.category}</div>
                </div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{yen(t.amount)}</div>
                <button onClick={() => setTxs((p) => p.filter((x) => x.id !== t.id))} style={S.delBtn} aria-label="削除">×</button>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

const S = {
  app: { fontFamily: "'Zen Maru Gothic', 'Hiragino Maru Gothic ProN', sans-serif", background: "repeating-linear-gradient(45deg, #FDEEF2 0 24px, #FCE7ED 24px 48px)", color: "#7A5560", minHeight: "100vh", maxWidth: 480, margin: "0 auto", display: "flex", flexDirection: "column" },
  header: { padding: "20px 18px 10px" },
  nav: { display: "flex", gap: 6, padding: "8px 14px", overflowX: "auto" },
  tabBtn: { flexShrink: 0, padding: "8px 12px", border: "none", borderRadius: 99, background: "rgba(255,255,255,.6)", color: "#C08A97", fontSize: 12, fontWeight: 500, whiteSpace: "nowrap" },
  tabActive: { background: "#E89BB0", color: "#FFFFFF" },
  main: { flex: 1, padding: "10px 14px 24px", display: "flex", flexDirection: "column", minHeight: 0 },
  card: { background: "#FFFDFD", borderRadius: 22, padding: 16, marginBottom: 12, border: "1.5px solid #F6D8E0", boxShadow: "0 2px 6px rgba(232,155,176,.15)" },
  cardTitle: { fontSize: 13, fontWeight: 700, color: "#A05A6E", marginBottom: 6 },
  btnPink: { background: "#E89BB0", color: "#fff", border: "none", borderRadius: 99, padding: "10px 18px", fontSize: 14, fontWeight: 700, boxShadow: "0 2px 4px rgba(232,155,176,.4)" },
  input: { flex: 1, border: "1.5px solid #F2C6D2", borderRadius: 99, padding: "10px 14px", fontSize: 14, background: "#fff", outlineColor: "#E89BB0" },
  textarea: { width: "100%", height: 160, border: "1.5px solid #F2C6D2", borderRadius: 14, padding: 10, fontSize: 13, background: "#fff", resize: "vertical", outlineColor: "#E89BB0" },
  bubbleMe: { background: "#E89BB0", color: "#fff", borderRadius: "18px 18px 4px 18px", padding: "10px 14px", maxWidth: "80%", fontSize: 14, lineHeight: 1.6 },
  bubbleAi: { background: "#FFFDFD", borderRadius: "18px 18px 18px 4px", padding: "10px 14px", maxWidth: "85%", fontSize: 14, lineHeight: 1.6, border: "1.5px solid #F6D8E0", boxShadow: "0 1px 3px rgba(232,155,176,.15)" },
  row: { display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: "1px dashed #F6D8E0" },
  delBtn: { border: "none", background: "transparent", color: "#E0B3BE", fontSize: 18, padding: "0 4px" },
};
