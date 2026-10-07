# AWS Elastic IP & Static IP Restricted CRUD Monitor

A zero-dependency Node.js system designed to enforce **Zero-Trust Static IP Whitelisting** and verify **AWS Elastic IP (EIP)** allocations for inbound and outbound API communication.

---

## 🌟 Key Features

1. **Static IP & AWS Elastic IP Whitelist Gate:**
   - Evaluates incoming client IP before executing any CRUD operations.
   - Unauthorized IPs receive an instant **HTTP 403 Forbidden** rejection with detailed diagnostics.
2. **Auto-Detection of Current System IPs:**
   - Detects local network IP (`192.168.1.22`), loopback (`127.0.0.1`, `::1`), and public IP (`171.49.155.253`).
3. **Protected CRUD Resource (`/api/records`):**
   - Full Create, Read, Update, Delete operations protected under the IP whitelist.
4. **Interactive Glassmorphism Dashboard:**
   - Live IP match status (`🟢 Access Granted` vs `🔴 Access Blocked - 403 Forbidden`).
   - One-click **"Block My IP (Test 403)"** & **"Restore My IP"** for immediate local validation.
   - Real-time live traffic & security log console.
   - Built-in API Docs & AWS Guide modal.
5. **Zero External Dependencies:**
   - Built on 100% native Node.js (`http`, `fs`, `os`, `fetch`). No heavy `node_modules` required.

---

## 🚀 How to Run

### 1. Start the Server
```bash
node server.js
```

### 2. Access the Dashboard
Open your web browser and navigate to:
* **Local Machine:** [http://localhost:4000](http://localhost:4000)
* **Local Network (LAN):** `http://<your-lan-ip>:4000` (e.g. `http://192.168.1.22:4000`)

---

## ☁️ How to Verify AWS Elastic IP (EIP)

AWS Elastic IP verify karne ke do tareeqe hain:

### Scenario 1: Aapka AWS EC2 instance is API ko call kar raha hai (Outbound Verification)
1. **Allocate Elastic IP in AWS:**
   - AWS Management Console me **EC2 > Network & Security > Elastic IPs** par jayein.
   - "Allocate Elastic IP" par click karein aur use apne EC2 instance ke sath **Associate** karein (e.g. `13.235.40.10`).
2. **Whitelist the Elastic IP:**
   - Dashboard me **Allowed IPs (Whitelist)** section me apna AWS Elastic IP (`13.235.40.10`) add karein.
3. **Verify from EC2 Terminal:**
   - EC2 instance me SSH login karein aur command run karein:
     ```bash
     curl -i http://<YOUR_MONITOR_IP>:4000/api/records
     ```
   - **Verification Pass (200 OK):** Response me `200 OK` milega aur Dashboard ke Live Logs me caller IP aapki Elastic IP dikhayega.
   - **Verification Fail (403 Forbidden):** Agar Elastic IP properly associate nahi hui aur traffic NAT Gateway ya dynamic IP se nikla, toh API **`403 Forbidden`** throw karegi.

---

### Scenario 2: Testing Across Multiple Systems (Different Laptops/PCs)

1. **System A (Host):**
   - Run `node server.js`.
   - Local Network IP note karein (e.g. `192.168.1.22`).
2. **System B (Other System):**
   - Dusre laptop ya phone se browser me open karein: `http://192.168.1.22:4000`.
   - **Result:** Agar System B ka IP whitelist me nahi hai, toh table par turant **Access Blocked (403 Forbidden)** dikhega aur koi bhi record fetch ya create nahi hoga!
   - System A ke dashboard par System B ka IP allow karte hi, System B ka access turant unblock ho jayega.

---

## 🧪 Quick Test: Test 403 Forbidden on the Same System

Aapko doosre system par jaane ki bhi zaroorat nahi hai:
1. Dashboard par **"Block My IP (Test 403)"** button click karein.
2. Ye aapki IP ko whitelist se remove kar dega.
3. Dekhein: Real-time status **"Access Blocked (403 Forbidden)"** ho jayega aur CRUD requests 403 status code ke sath reject ho jayengi.
4. **"Restore My IP (Allow)"** par click karein — access turant **200 OK** me restore ho jayega!

---

## 📚 API Documentation

Detailed schema, endpoints, and cURL commands are documented in **[API_DOCS.md](file:///Users/fakhridesigning/Desktop/Devlopment/fakhri-cron-monitor/API_DOCS.md)**.
