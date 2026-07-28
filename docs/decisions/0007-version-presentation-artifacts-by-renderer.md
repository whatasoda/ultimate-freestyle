# ADR 0007: 発表成果物をrenderer versionでも識別する

- 状態: 採用
- 日付: 2026-07-28

## 背景

発表previewは研究versionと生成HTMLを不変revisionとしてR2へ保存する。これまでは研究versionだけでpreviewの鮮度を判定していたため、研究データが変わらないままrendererの文字fitやMarkdown解釈を修正すると、古いHTMLも「最新」と表示された。

## 決定

- rendererはdeck component runtimeとは別に明示的な`uf-renderer@N`を持ち、生成HTMLとrevision metadataへ記録する。
- previewの鮮度は研究versionとrenderer versionの両方で判定する。
- どちらかが一致しないpreviewはWeb UIで「要再生成」と表示し、公開操作を無効化する。
- publish APIでも同じ検証を行い、古い画面からの直接操作を拒否する。
- 既存revisionはmigrationで`uf-renderer@1`として扱う。R2上の不変成果物は書き換えない。

## 結果

renderer修正後に古いpreviewを誤って確認・公開することを防げる。renderer更新時は利用者が新しいpreviewを生成して見た目を確認する必要がある。公開済み成果物は意図せず切り替わらず、不変revisionという性質を維持する。
