#!/usr/bin/env bash
set -euo pipefail

REPOSITORY="robbin810130/dsh-vault-plugin"
ASSET="dsh-vault-plugin.tgz"
DOWNLOAD_URL="https://github.com/${REPOSITORY}/releases/latest/download/${ASSET}"

if ! command -v dsh >/dev/null 2>&1; then
  echo "错误：未找到 dsh。请先安装 DSH 并确保 dsh 已加入 PATH。" >&2
  exit 1
fi

if ! command -v curl >/dev/null 2>&1; then
  echo "错误：未找到 curl。" >&2
  exit 1
fi

TMP_DIR="$(mktemp -d 2>/dev/null || mktemp -d -t dsh-vault)"
cleanup() { rm -f "$TMP_DIR/$ASSET" "$TMP_DIR/$ASSET.sha256"; rmdir "$TMP_DIR" 2>/dev/null || true; }
trap cleanup EXIT INT TERM
PACKAGE="$TMP_DIR/$ASSET"
CHECKSUM="$TMP_DIR/$ASSET.sha256"

echo "下载 DSH Vault 最新版..."
curl --fail --location --silent --show-error --retry 3 "$DOWNLOAD_URL" --output "$PACKAGE"
curl --fail --location --silent --show-error --retry 3 "${DOWNLOAD_URL}.sha256" --output "$CHECKSUM"

EXPECTED="$(awk '{print $1}' "$CHECKSUM")"
if command -v shasum >/dev/null 2>&1; then
  ACTUAL="$(shasum -a 256 "$PACKAGE" | awk '{print $1}')"
elif command -v sha256sum >/dev/null 2>&1; then
  ACTUAL="$(sha256sum "$PACKAGE" | awk '{print $1}')"
else
  echo "错误：未找到 shasum 或 sha256sum。" >&2
  exit 1
fi
if [[ -z "$EXPECTED" || "$EXPECTED" != "$ACTUAL" ]]; then
  echo "错误：插件包 SHA-256 校验失败。" >&2
  exit 1
fi

echo "安装到 DSH web profile..."
dsh plugin --profile web add "$PACKAGE"
echo "DSH Vault 安装/升级完成。请重启 DSH Web profile。"
