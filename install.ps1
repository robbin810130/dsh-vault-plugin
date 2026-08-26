$ErrorActionPreference = 'Stop'
$repository = 'robbin810130/dsh-vault-plugin'
$asset = 'dsh-vault-plugin.tgz'
$baseUrl = "https://github.com/$repository/releases/latest/download"

if (-not (Get-Command dsh -ErrorAction SilentlyContinue)) {
  throw '未找到 dsh。请先安装 DSH 并确保 dsh.exe 已加入 PATH。'
}
if (-not (Get-Command Get-FileHash -ErrorAction SilentlyContinue)) {
  throw '当前 PowerShell 缺少 Get-FileHash。'
}

$temp = Join-Path ([System.IO.Path]::GetTempPath()) ("dsh-vault-{0}" -f [guid]::NewGuid())
New-Item -ItemType Directory -Path $temp | Out-Null
try {
  $package = Join-Path $temp $asset
  $checksum = Join-Path $temp "$asset.sha256"
  Write-Host '下载 DSH Vault 最新版...'
  Invoke-WebRequest -UseBasicParsing -Uri "$baseUrl/$asset" -OutFile $package
  Invoke-WebRequest -UseBasicParsing -Uri "$baseUrl/$asset.sha256" -OutFile $checksum
  $expected = (Get-Content $checksum -Raw).Trim().Split(' ')[0].ToLowerInvariant()
  $actual = (Get-FileHash $package -Algorithm SHA256).Hash.ToLowerInvariant()
  if ([string]::IsNullOrWhiteSpace($expected) -or $expected -ne $actual) { throw '插件包 SHA-256 校验失败。' }
  Write-Host '安装到 DSH web profile...'
  & dsh plugin --profile web add $package
  if ($LASTEXITCODE -ne 0) { throw "DSH 插件安装失败，退出码 $LASTEXITCODE。" }
  Write-Host 'DSH Vault 安装/升级完成。请重启 DSH Web profile。'
} finally {
  Remove-Item -LiteralPath $temp -Recurse -Force -ErrorAction SilentlyContinue
}
