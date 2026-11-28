$ErrorActionPreference = 'Stop'
$scriptDir = $PSScriptRoot
Copy-Item (Join-Path $scriptDir '*.mjs') e2e
$runner = Get-Content 'e2e/native-acceptance.ts' -Raw
$processRunner = Get-Content 'e2e/acceptance-process.ts' -Raw
if (!$runner.Contains("suite: 'procurement'") -or !$processRunner.Contains('e2e/preaccept-ui.ts')) {
  throw 'Native runner entry points changed.'
}
$runner.Replace('./acceptance-process.ts', './reader-process.ts').Replace("suite: 'procurement'", "suite: 'follow-up-nvda'").Replace('执行采购浏览器验收','执行跟进中心 NVDA 验收').Replace('Procurement browser acceptance failed','Follow-up NVDA acceptance failed').Replace('await writeSummary({ sha, result:', 'await writeReaderSummary({ sha, result:').Replace('async function writeSummary','async function writeReaderSummary').Replace('acceptanceSummary(summary)', 'readerSummary(summary)') + @'

function readerSummary(summary: AcceptanceSummary): string {
  return "\n## Follow-up center | native NVDA diagnostic\n\n" +
    "Application SHA: `" + summary.sha + "`\n\nResult: " + summary.result + "\n" +
    ("error" in summary ? "\n" + summary.stage + ": " + summary.error + "\n" : "");
}
'@ | Set-Content 'e2e/reader-native.ts' -Encoding utf8
$processRunner.Replace('e2e/preaccept-ui.ts', 'e2e/follow-up-nvda.mjs') | Set-Content 'e2e/reader-process.ts' -Encoding utf8
