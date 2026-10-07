# API Documentation — Static & AWS Elastic IP Whitelisted CRUD API

This document provides complete technical specifications for the IP-Restricted CRUD API system, designed for zero-trust IP whitelisting and AWS Elastic IP (EIP) verification.

---

## 1. Security Architecture & IP Enforcement

### How IP Validation Works
Every incoming request to protected routes (`/api/records/*`) is evaluated against the allowed IP list:
1. **IP Resolution Hierarchy:**
   - Simulated test header `x-simulated-ip` (if supplied, for testing purposes).
   - Reverse proxy header `x-forwarded-for` (first client IP).
   - Direct connection `req.socket.remoteAddress`.
2. **Normalization:**
   - Strips `::ffff:` IPv4-over-IPv6 prefixes.
   - Maps `::1` and `127.0.0.1` as loopback equivalents.
3. **Decision Gate:**
   - **Matched (In Whitelist):** Request passes to the CRUD controller (**200 OK / 201 Created**).
   - **Not Matched:** Request is immediately rejected with **HTTP 403 Forbidden**.

---

## 2. Protected Endpoints (`/api/records`)

All endpoints in this section require the client's IP to be whitelisted.

### 2.1. List All Records
* **Endpoint:** `GET /api/records`
* **Query Parameters:**
  * `search` *(optional)*: Filter by record name, category, or environment.
* **Success Response (HTTP 200 OK):**
```json
{
  "success": true,
  "count": 2,
  "callerIp": "192.168.1.22",
  "data": [
    {
      "id": "rec_001",
      "name": "AWS EC2 Cron Worker",
      "category": "Background Task",
      "environment": "AWS-Mumbai-ap-south-1",
      "status": "Active",
      "ipBinding": "Elastic IP (Allocated)",
      "description": "Daily automated billing reconciliation worker instance.",
      "createdAt": "2026-10-06T10:00:00.000Z"
    }
  ]
}
```

* **Error Response: Unauthorized IP (HTTP 403 Forbidden):**
```json
{
  "success": false,
  "status": 403,
  "error": "Forbidden: IP Not Authorized",
  "message": "Access denied. Your IP address (203.0.113.45) is not present in the allowed static/Elastic IP whitelist.",
  "clientIp": "203.0.113.45",
  "rawClientIp": "::ffff:203.0.113.45",
  "allowedIps": ["127.0.0.1", "::1", "192.168.1.22"],
  "timestamp": "2026-10-06T12:35:10.512Z",
  "tip": "Add your IP to config.json or via the System Dashboard to gain access."
}
```

---

### 2.2. Get Single Record by ID
* **Endpoint:** `GET /api/records/:id`
* **Path Parameters:**
  * `id`: Record ID (e.g. `rec_001`)
* **Success Response (HTTP 200 OK):**
```json
{
  "success": true,
  "callerIp": "192.168.1.22",
  "data": {
    "id": "rec_001",
    "name": "AWS EC2 Cron Worker",
    "category": "Background Task",
    "environment": "AWS-Mumbai-ap-south-1",
    "status": "Active",
    "description": "Daily automated billing reconciliation worker instance.",
    "createdAt": "2026-10-06T10:00:00.000Z"
  }
}
```
* **Not Found Response (HTTP 404):**
```json
{
  "success": false,
  "error": "Record not found",
  "id": "rec_invalid"
}
```

---

### 2.3. Create New Record
* **Endpoint:** `POST /api/records`
* **Headers:** `Content-Type: application/json`
* **Request Body:**
```json
{
  "name": "Payment Webhook Dispatcher",
  "category": "API Service",
  "environment": "AWS-EC2-EIP",
  "status": "Active",
  "description": "Processes banking confirmation webhooks from trusted gateway."
}
```
* **Success Response (HTTP 201 Created):**
```json
{
  "success": true,
  "message": "Record created successfully",
  "callerIp": "192.168.1.22",
  "data": {
    "id": "rec_m8b3k49s",
    "name": "Payment Webhook Dispatcher",
    "category": "API Service",
    "environment": "AWS-EC2-EIP",
    "status": "Active",
    "ipBinding": "Created by IP: 192.168.1.22",
    "description": "Processes banking confirmation webhooks from trusted gateway.",
    "createdAt": "2026-10-06T12:38:45.100Z"
  }
}
```

---

### 2.4. Update Existing Record
* **Endpoint:** `PUT /api/records/:id`
* **Headers:** `Content-Type: application/json`
* **Request Body:**
```json
{
  "status": "Maintenance",
  "description": "Upgrading Node runtime to v22 LTS."
}
```
* **Success Response (HTTP 200 OK):**
```json
{
  "success": true,
  "message": "Record updated successfully",
  "callerIp": "192.168.1.22",
  "data": {
    "id": "rec_001",
    "name": "AWS EC2 Cron Worker",
    "status": "Maintenance",
    "description": "Upgrading Node runtime to v22 LTS.",
    "updatedAt": "2026-10-06T12:40:00.000Z",
    "lastModifiedByIp": "192.168.1.22"
  }
}
```

---

### 2.5. Delete Record
* **Endpoint:** `DELETE /api/records/:id`
* **Success Response (HTTP 200 OK):**
```json
{
  "success": true,
  "message": "Record deleted successfully",
  "callerIp": "192.168.1.22",
  "data": {
    "id": "rec_001",
    "name": "AWS EC2 Cron Worker"
  }
}
```

---

## 3. System & Network Inspection Endpoints (Public)

These endpoints allow the dashboard and automated diagnostics tools to view network state and manage whitelisted IPs.

### 3.1. Get Live Network Diagnostics
* **Endpoint:** `GET /api/system/network-info`
* **Response:**
```json
{
  "success": true,
  "detectedClientIp": "192.168.1.22",
  "rawClientIp": "::ffff:192.168.1.22",
  "isAccessGranted": true,
  "enableWhitelist": true,
  "serverPublicIp": "171.49.155.253",
  "serverLocalIps": ["192.168.1.22"],
  "allowedIps": ["127.0.0.1", "::1", "192.168.1.22", "171.49.155.253"],
  "notes": "Configure your AWS Elastic IP or client static IP here.",
  "serverTime": "2026-10-06T12:41:00.000Z"
}
```

### 3.2. Manage Whitelist (Add / Remove / Toggle)
* **Endpoint:** `POST /api/system/allowed-ips`
* **Add IP Payload:**
```json
{ "action": "add", "ip": "13.235.40.10" }
```
* **Remove IP Payload:**
```json
{ "action": "remove", "ip": "13.235.40.10" }
```
* **Toggle Whitelist Enforcement:**
```json
{ "enableWhitelist": false }
```

### 3.3. Reset Demo System
* **Endpoint:** `POST /api/system/reset-demo`
* Resets records to initial demo records and re-adds the machine's detected IP to the whitelist.

---

## 4. Testing with cURL

### Test 1: Authorized Request (200 OK)
```bash
curl -X GET "http://localhost:4000/api/records"
```

### Test 2: Unauthorized Request Simulation (403 Forbidden)
```bash
curl -X GET "http://localhost:4000/api/records" \
     -H "x-simulated-ip: 198.51.100.77"
```

### Test 3: Create Record via cURL
```bash
curl -X POST "http://localhost:4000/api/records" \
     -H "Content-Type: application/json" \
     -d '{"name":"Billing Audit Service","category":"Task","environment":"AWS-Production"}'
```
