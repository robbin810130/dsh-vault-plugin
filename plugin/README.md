# DSH Vault Plugin

Host-side privacy lock for DSH. The package stores only non-sensitive policy in the DSH Settings namespace dsh-vault; verifier, recovery, binding, and audit state remain in the private Host state directory.

Emergency removal invocation: dsh plugin --profile web exec dsh-vault protection remove --group <full-group-id>

## Canonical state directory

Host and CLI call the same resolver. Its priority is: explicit Host `Config.stateDir` or CLI `--state-dir /absolute/path`; then `DSH_VAULT_STATE_DIR=/absolute/path`; then `DSH_HOME/vault-lock`; finally `~/.dsh/vault-lock`. Every supplied path is required to be absolute, including lower-priority values. When an explicit CLI override is used, it must name the same directory as the Host configuration.
