export const CLIENT_GUIDE_INFORMATION_DATE = "2026-08-01";

export function renderClientChoiceGuide(): string {
  return `<p class="guide-intro">最初に料金ではなく、使いたい画面から任意のRemote MCPを登録できるかを確認します。登録できる環境をすでに持っているなら、それを使うのが最短です。</p>
    <div class="decision-flow" aria-label="AIクライアント選択の判断フロー">
      <article class="decision-question decision-start"><span class="decision-number">1</span><div><p class="decision-kicker">Capability gate</p><h3>いま使っているAIに、任意のMCP URLを登録する場所がありますか？</h3><p>次のいずれかが実際の画面にあるか確認します。料金プラン名だけでは判断しません。</p></div></article>
      <div class="decision-branches decision-branches-three">
        <a class="decision-result decision-chatgpt" href="#chatgpt"><span class="decision-answer">ある · ChatGPT</span><strong>Developer mode → Plugins → ＋</strong><small>表示されるなら、まず現在の契約のままChatGPTを使う</small></a>
        <a class="decision-result decision-claude" href="#claude-web"><span class="decision-answer">ある · Claude</span><strong>Connectors → Add custom connector</strong><small>最も簡単。Freeでもカスタムコネクタ1件まで</small></a>
        <a class="decision-result decision-codex" href="#codex"><span class="decision-answer">ある · Codex</span><strong>Settings → MCP servers</strong><small>制作、検証、細かな修正を長く自律実行したい人向け</small></a>
      </div>
      <div class="decision-connector" aria-hidden="true"><span>どれもない</span></div>
      <article class="decision-question"><span class="decision-number">2</span><div><p class="decision-kicker">Setup</p><h3>アプリやCLIをインストールできますか？</h3></div></article>
      <div class="decision-branches">
        <a class="decision-result decision-claude" href="#claude-web"><span class="decision-answer">できない／したくない</span><strong>Claude WebのFreeから試す</strong><small>ブラウザだけで開始。1件の枠を最自由研究に使う</small></a>
        <div class="decision-next"><span class="decision-answer">できる</span><strong>次の質問へ</strong></div>
      </div>
      <div class="decision-connector" aria-hidden="true"><span>インストールできる</span></div>
      <article class="decision-question"><span class="decision-number">3</span><div><p class="decision-kicker">Working style</p><h3>どちらの進め方を重視しますか？</h3></div></article>
      <div class="decision-branches">
        <a class="decision-result decision-codex" href="#codex"><span class="decision-answer">長時間の制作・検証・反復</span><strong>Codex</strong><small>自律的な作業、差分確認、テストを重視</small></a>
        <a class="decision-result decision-claude" href="#claude-code"><span class="decision-answer">対話・文章・構成を中心に制作</span><strong>Claude / Claude Code</strong><small>ブラウザならFree、Claude Codeも使うならPro以上</small></a>
      </div>
    </div>
    <div class="guide-recommendation"><p class="eyebrow">迷ったら</p><strong>初めてならClaude Free、継続制作ならCodex PlusまたはClaude Pro。</strong><p>ChatGPTはDeveloper modeがいまのアカウントに表示される場合に選びます。表示されない状態で、MCPだけを目的に先にプラン変更することは勧めません。</p></div>
    <div id="plans" class="plan-comparison" role="region" aria-label="AIクライアントと料金プランの比較" tabindex="0">
      <table class="plan-table">
        <thead><tr><th>環境</th><th>最小の始め方</th><th>有料へ上げる目安</th><th>向いている使い方</th></tr></thead>
        <tbody>
          <tr><th><span class="client-mark client-mark-claude">Claude</span></th><td data-label="最小の始め方"><strong>Free · $0</strong><br><small>カスタムRemote MCPは1件まで。現在beta。</small></td><td data-label="有料へ上げる目安"><strong>Pro · $20/月</strong><br><small>利用量を増やしClaude Codeも使う。Maxは$100／$200。</small></td><td data-label="向いている使い方">インストールなし、対話・文章・構成中心</td></tr>
          <tr><th><span class="client-mark client-mark-codex">Codex</span></th><td data-label="最小の始め方"><strong>Free · $0 / Go · $8/月</strong><br><small>MCP serversを追加できるCodexクライアントで開始。</small></td><td data-label="有料へ上げる目安"><strong>Plus · $20/月</strong><br><small>定期的な制作向け。Proは$100/月から。</small></td><td data-label="向いている使い方">長時間の自律作業、検証、細かな反復</td></tr>
          <tr><th><span class="client-mark client-mark-chatgpt">ChatGPT</span></th><td data-label="最小の始め方"><strong>現在の契約で先に確認</strong><br><small>Developer modeの表示が必須。アカウント・組織設定に依存。</small></td><td data-label="有料へ上げる目安"><strong>料金より利用可否の確認が先</strong><br><small>同じOpenAI契約でCodexを選べる場合がある。</small></td><td data-label="向いている使い方">普段のChatGPTから画面を変えたくない</td></tr>
        </tbody>
      </table>
    </div>
    <p class="guide-source-note">料金は米ドル、税別相当の公式表示を${CLIENT_GUIDE_INFORMATION_DATE}に確認したものです。地域、税、年払い、組織ポリシー、提供状況により変わります。契約前に各公式画面で再確認してください。</p>`;
}
