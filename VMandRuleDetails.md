Firewall rule:
{
"allowed": [
{
"IPProtocol": "tcp",
"ports": [
"8000"
]
},
{
"IPProtocol": "udp",
"ports": [
"8000"
]
}
],
"creationTimestamp": "2026-01-09T05:24:18.668-08:00",
"description": "",
"direction": "INGRESS",
"disabled": false,
"enableLogging": false,
"id": "8210818098153701229",
"kind": "compute#firewall",
"logConfig": {
"enable": false
},
"name": "port8000",
"network": "projects/i-crossbar-482114-g9/global/networks/default",
"priority": 1000,
"selfLink": "projects/i-crossbar-482114-g9/global/firewalls/port8000",
"sourceRanges": [
"0.0.0.0/0"
],
"targetTags": [
"port8000"
]
}
Setup the VM instance
POST https://compute.googleapis.com/compute/v1/projects/i-crossbar-482114-g9/zones/us-east4-c/instances
{
"canIpForward": false,
"confidentialInstanceConfig": {
"enableConfidentialCompute": false
},
"deletionProtection": false,
"description": "",
"disks": [
{
"autoDelete": true,
"boot": true,
"deviceName": "vidbolt-workflow",
"diskEncryptionKey": {},
"initializeParams": {
"diskSizeGb": "300",
"diskType": "projects/i-crossbar-482114-g9/zones/us-east4-c/diskTypes/hyperdisk-balanced",
"labels": {},
"provisionedIops": "4800",
"provisionedThroughput": "590",
"resourcePolicies": [
"projects/i-crossbar-482114-g9/regions/us-east4/resourcePolicies/default-schedule-1"
],
"sourceImage": "projects/ubuntu-os-cloud/global/images/ubuntu-2204-jammy-v20260114"
},
"mode": "READ_WRITE",
"type": "PERSISTENT"
}
],
"displayDevice": {
"enableDisplay": false
},
"guestAccelerators": [
{
"acceleratorCount": 1,
"acceleratorType": "projects/i-crossbar-482114-g9/zones/us-east4-c/acceleratorTypes/nvidia-rtx-pro-6000"
}
],
"instanceEncryptionKey": {},
"keyRevocationActionType": "NONE",
"labels": {
"goog-ops-agent-policy": "v2-x86-template-1-4-0",
"goog-ec-src": "vm_add-rest"
},
"machineType": "projects/i-crossbar-482114-g9/zones/us-east4-c/machineTypes/g4-standard-48",
"metadata": {
"items": [
{
"key": "enable-osconfig",
"value": "TRUE"
}
]
},
"name": "vidbolt-workflow",
"networkInterfaces": [
{
"accessConfigs": [
{
"name": "External NAT",
"natIP": "35.199.43.129",
"networkTier": "PREMIUM"
}
],
"nicType": "GVNIC",
"stackType": "IPV4_ONLY",
"subnetwork": "projects/i-crossbar-482114-g9/regions/us-east4/subnetworks/default"
}
],
"params": {
"resourceManagerTags": {}
},
"reservationAffinity": {
"consumeReservationType": "NO_RESERVATION"
},
"scheduling": {
"automaticRestart": false,
"instanceTerminationAction": "STOP",
"onHostMaintenance": "TERMINATE",
"provisioningModel": "SPOT"
},
"serviceAccounts": [
{
"email": "796656560864-compute@developer.gserviceaccount.com",
"scopes": [
"https://www.googleapis.com/auth/devstorage.read_only",
"https://www.googleapis.com/auth/logging.write",
"https://www.googleapis.com/auth/monitoring.write",
"https://www.googleapis.com/auth/service.management.readonly",
"https://www.googleapis.com/auth/servicecontrol",
"https://www.googleapis.com/auth/trace.append"
]
}
],
"shieldedInstanceConfig": {
"enableIntegrityMonitoring": true,
"enableSecureBoot": false,
"enableVtpm": true
},
"tags": {
"items": [
"port8000",
"http-server",
"https-server"
]
},
"zone": "projects/i-crossbar-482114-g9/zones/us-east4-c"
}
