# DSH Vault Plugin

Host-side privacy lock for DSH. The package stores only non-sensitive policy in the DSH Settings namespace dsh-vault; verifier, recovery, binding, and audit state remain in the private Host state directory.

Emergency removal invocation: dsh plugin --profile web exec dsh-vault protection remove --group <full-group-id>
