Technical Spec: Automated User-Hosted GPU Node Provisioning
System Goal: Programmatically provision a Google Cloud VM with NVIDIA RTX 6000 GPUs on a user’s connected GCP account, handle the complex driver installation process automatically via a self-healing startup script, and sync the instance status/IP back to the Next.js application.

Phase 1: Pre-Flight Verification (Next.js Backend)
Before attempting to create any resources, the system must verify the user's environment is capable of hosting the requested hardware.

Authentication Refresh:

Retrieve the user’s stored OAuth2 refresh_token.

Exchange it for a valid access_token to authenticate the Google Compute Engine client.

Quota Verification (Critical Step):

Query the Google Cloud Compute API for "Regional Quotas" in the target region (e.g., us-east4).

Filter the response for the metric corresponding to NVIDIA RTX 6000 GPUs (or the general NVIDIA GPU metric depending on the API version).

Logic: Compare the limit against usage.

Decision Tree:

If (limit - usage) < 1: Halt execution. Return a structured error to the frontend indicating the user must request a GPU quota increase manually.

If (limit - usage) >= 1: Proceed to Phase 2.

Phase 2: Network Infrastructure (Next.js Backend)
Ensure the network allows traffic to the API without causing "Resource Already Exists" errors.

Idempotent Firewall Check:

Query the project's firewall rules to check for an existing rule named (e.g., allow-vidbolt-8000).

Conditional Creation:

If the rule exists: Skip this step.

If the rule is missing: Create a new Ingress rule.

Protocol/Ports: TCP:8000, UDP:8000.

Source: Allow from 0.0.0.0/0 (Anywhere).

Target Tags: Assign a specific tag (e.g., vidbolt-node) that will later be applied to the VM.

Phase 3: VM Provisioning Logic (Next.js Backend)
Construct the payload to create the VM. This must be a single API call that includes the machine configuration and the automation instructions.

Define Instance Configuration:

Machine Type: g4-standard-48 (or specific requirements).

Accelerator: Attach 1 nvidia-rtx-pro-6000.

Disk: 300GB Balanced Persistent Disk with the specific Ubuntu 22.04 boot image.

Networking: Attach the default network and request an Ephemeral External IP (NAT).

Tags: Apply the target tag defined in Phase 2 (e.g., vidbolt-node).

Scheduling: Set provisioning model to SPOT. Set "On Host Maintenance" to TERMINATE (required for GPUs).

Inject Metadata (The Brain):

Inject custom metadata key-value pairs into the instance creation request.

Key 1 (vidbolt-user-id): The Supabase User ID (to identify the owner).

Key 2 (startup-script): A bash script string containing the logic defined in Phase 4.

Phase 4: Startup Script Logic (Bash/Shell)
This logic runs automatically inside the VM every time it boots. It must handle the "Two-Boot" driver installation process and application deployment.

Sequence of Operations (Top to Bottom):

Operation 0: "Phone Home" (Run Always)

Fetch the current External IP and User ID from the internal Google Metadata Server.

Send a POST request to the Next.js Webhook (Phase 5) with the payload { ip, user_id, status: "booting" }.

Reasoning: Spot instances may change IPs on reboot; this ensures the DB is always accurate immediately upon boot.

Checkpoint 1: Driver Installation (Run Once)

Check: Does a specific file flag exist (e.g., /var/lib/drivers_installed)?

If NO (First Boot):

Purge old drivers.

Install prerequisites, NVIDIA Drivers (575-open), Docker, and NVIDIA Container Toolkit.

Configure Docker runtime.

Action: Create the checkpoint file flag.

Action: Execute reboot immediately to load kernel modules.

Exit script.

If YES (Subsequent Boots):

Proceed to Checkpoint 2.

Checkpoint 2: Repository Setup

Check: Does the repository directory exist?

If NO: Clone the GitHub repo using the injected Auth Token.

If YES: Navigate to the directory and run git pull to fetch updates.

Operation 3: Launch Application

Run docker compose up -d.

Note: Since Docker images are cached on disk, this is fast on subsequent boots.

Operation 4: Final Signal

Send a second POST request to the Next.js Webhook.

Payload: { ip, user_id, status: "ready" }.

Phase 5: State Synchronization (Next.js Webhook)
A dedicated API route to receive updates from the VM.

Webhook Endpoint Logic:

Accept POST requests containing user_id, ip, and status.

Validate the request (optional: check a shared secret or origin).

Database Action: Update the user's record in Supabase:

Set the current_ip to the new IP address.

Set the instance_status to the received status ("booting" or "ready").
