# 発表デザインとAI制作の9/10基準

発表の機能数ではなく、研究固有の見た目を安全に作り、別のAI Agentでも意図を引き継げるかを判定する。各項目を1点とし、9点以上に加えて失格条件がない状態を9/10とする。

## 見た目の多様性

1. 配色、font、領域・密度、部品処理、動きの5軸に研究と結び付く意図がある。
2. 比較する3方向を色替えではなく、情報階層と部品構成でも判別できる。
3. 表紙、本文、結果、結びの4役割以上を同じ世界観の中で描き分けられる。
4. 文章量と証拠形式に応じてflow、scene、canvasを使い分けられる。
5. 16:9または4:3の実rendererで見切れ、過剰な自動縮小、コントラスト不足がない。

## AIを使った制作

1. design briefと採用理由を`design_notes`へ保存し、後続Agentが判断を再現できる。
2. 現在のresourceとversionを読んでから、対象とfieldを明示した部分編集だけを行う。
3. 提案、採用確認、適用、再読取、実表示確認を順に行う。
4. template、role差分、flow typography、scene component、canvas blockを変更範囲に応じて使い分ける。
5. 終了時に変更、継承、利用者が実表示で確認するものを区別して返す。

## 失格条件

- 研究本文、証拠、読み上げ原稿を見た目調整の副作用で変更した。
- 任意HTML、CSS、JavaScript、外部font URLを利用した。
- 見切れ、標準文字のコントラスト不足、70%未満の自動縮小を残した。
- 利用者の採用確認前に提案を保存した。

## 証拠の場所

- 現在値と実効デザイン：`research://projects/{id}/deck`
- 制作手順：`research://guide/presentation-design-workflow`
- 安全な設定値：`research://guide/presentation-style`
- 実表示の確認：Web UIの一括品質確認と固定プレビュー
- AI用入口：MCP prompt `refine_presentation_design`
