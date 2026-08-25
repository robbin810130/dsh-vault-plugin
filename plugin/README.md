# DSH Vault Plugin

Host-side privacy lock for DSH. The package stores only non-sensitive policy in the DSH Settings namespace dsh-vault; verifier, recovery, binding, and audit state remain in the private Host state directory.

Emergency removal invocation: dsh plugin --profile web exec dsh-vault protection remove --group <full-group-id>

Host and CLI use the same state directory: `~/.dsh/vault-lock` by default. The Host may set an absolute `Config.stateDir`; the CLI may use `--state-dir /absolute/path` or `DSH_VAULT_STATE_DIR=/absolute/path`. The CLI override must match the Host configuration when both are used. Relative paths are rejected.
