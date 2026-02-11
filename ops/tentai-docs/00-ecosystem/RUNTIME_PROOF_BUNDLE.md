# RUNTIME_PROOF_BUNDLE

## Ports table output (3000/3001/3100/3200)
```
LocalAddress LocalPort  State OwningProcess
------------ ---------  ----- -------------
127.0.0.1         3200 Listen         55700
0.0.0.0           3001 Listen         47716
```

## localhost resolution output
```
::1
127.0.0.1
```

## netsh interface ipv6 show prefixpolicies
```
Precedence  Label  Prefix
----------  -----  --------------------------------
        50      0  ::1/128
        40      1  ::/0
        35      4  ::ffff:0:0/96
        30      2  2002::/16
         5      5  2001::/32
         3     13  fc00::/7
         1     11  fec0::/10
         1     12  3ffe::/16
         1      3  ::/96
```

## curl.exe -v Overseer /health (localhost)
```
* Host localhost:3200 was resolved.
* IPv6: ::1
* IPv4: 127.0.0.1
*   Trying [::1]:3200...
*   Trying 127.0.0.1:3200...
* Established connection to localhost (127.0.0.1 port 3200) from 127.0.0.1 port 56313
* using HTTP/1.x
> GET /health HTTP/1.1
> Host: localhost:3200
> User-Agent: curl/8.16.0
> Accept: */*
>
< HTTP/1.1 200 OK
< access-control-allow-origin: *
< access-control-allow-methods: GET, POST, PUT, DELETE, OPTIONS
< access-control-allow-headers: Content-Type
< content-type: application/json; charset=utf-8
< content-length: 49
< Date: Tue, 30 Dec 2025 03:29:25 GMT
< Connection: keep-alive
< Keep-Alive: timeout=72
<
{"ok":true,"uptime":183.4202411,"testMode":false}* Connection #0 to host localhost:3200 left intact
```

## curl.exe -v Overseer /health (127.0.0.1)
```
*   Trying 127.0.0.1:3200...
* Established connection to 127.0.0.1 (127.0.0.1 port 3200) from 127.0.0.1 port 56314
* using HTTP/1.x
> GET /health HTTP/1.1
> Host: 127.0.0.1:3200
> User-Agent: curl/8.16.0
> Accept: */*
>
< HTTP/1.1 200 OK
< access-control-allow-origin: *
< access-control-allow-methods: GET, POST, PUT, DELETE, OPTIONS
< access-control-allow-headers: Content-Type
< content-type: application/json; charset=utf-8
< content-length: 49
< Date: Tue, 30 Dec 2025 03:29:25 GMT
< Connection: keep-alive
< Keep-Alive: timeout=72
<
{"ok":true,"uptime":183.4371666,"testMode":false}* Connection #0 to host 127.0.0.1:3200 left intact
```

## curl.exe -v Sovereign /health (localhost)
```
* Host localhost:3001 was resolved.
* IPv6: ::1
* IPv4: 127.0.0.1
*   Trying [::1]:3001...
*   Trying 127.0.0.1:3001...
* Established connection to localhost (127.0.0.1 port 3001) from 127.0.0.1 port 56316
* using HTTP/1.x
> GET /health HTTP/1.1
> Host: localhost:3001
> User-Agent: curl/8.16.0
> Accept: */*
>
* Request completely sent off
< HTTP/1.1 200 OK
< X-Powered-By: Express
< Access-Control-Allow-Origin: *
< Content-Type: application/json; charset=utf-8
< Content-Length: 52
< ETag: W/"34-F44dOf4Yc6fGnBcrCHxt2KC45kM"
< Date: Tue, 30 Dec 2025 03:29:25 GMT
< Connection: keep-alive
< Keep-Alive: timeout=5
<
{"status":"ok","name":"sovereign","version":"0.1.0"}* Connection #0 to host localhost:3001 left intact
```

## curl.exe -v Sovereign /health (127.0.0.1)
```
*   Trying 127.0.0.1:3001...
* Established connection to 127.0.0.1 (127.0.0.1 port 3001) from 127.0.0.1 port 56317
* using HTTP/1.x
> GET /health HTTP/1.1
> Host: 127.0.0.1:3001
> User-Agent: curl/8.16.0
> Accept: */*
>
< HTTP/1.1 200 OK
< X-Powered-By: Express
< Access-Control-Allow-Origin: *
< Content-Type: application/json; charset=utf-8
< Content-Length: 52
< ETag: W/"34-F44dOf4Yc6fGnBcrCHxt2KC45kM"
< Date: Tue, 30 Dec 2025 03:29:25 GMT
< Connection: keep-alive
< Keep-Alive: timeout=5
<
{"status":"ok","name":"sovereign","version":"0.1.0"}* Connection #0 to host 127.0.0.1:3001 left intact
```

## curl.exe -v Sovereign proxy /overseer/ecosystem/status
```
*   Trying 127.0.0.1:3001...
* Established connection to 127.0.0.1 (127.0.0.1 port 3001) from 127.0.0.1 port 57473
* using HTTP/1.x
> GET /overseer/ecosystem/status HTTP/1.1
> Host: 127.0.0.1:3001
> User-Agent: curl/8.16.0
> Accept: */*
>
* Request completely sent off
< HTTP/1.1 200 OK
< X-Powered-By: Express
< access-control-allow-origin: *
< access-control-allow-methods: GET, POST, PUT, DELETE, OPTIONS
< access-control-allow-headers: Content-Type
< content-type: application/json; charset=utf-8
< content-length: 724
< date: Tue, 30 Dec 2025 03:29:10 GMT
< connection: keep-alive
< keep-alive: timeout=72
<
{"healthy":false,"timestamp":1767065350548,"services":{"vi-core":{"name":"Vi Core","port":3100,"status":"stopped","uptime":0,"critical":true,"crashCount":0},"memory-store":{"name":"Memory Store","port":3050,"status":"stopped","uptime":0,"critical":true,"crashCount":0},"vector-store":{"name":"Vector Store (Qdrant)","port":6333,"status":"stopped","uptime":0,"critical":true,"crashCount":0},"redis":{"name":"Redis Cache","port":6379,"status":"stopped","uptime":0,"critical":false,"crashCount":0},"workers":{"name":"Worker Pool","port":3150,"status":"stopped","uptime":0,"critical":false,"crashCount":0},"sovereign":{"name":"Sovereign (God Console)","port":3001,"status":"stopped","uptime":0,"critical":false,"crashCount":0}}}* Connection #0 to host 127.0.0.1:3001 left intact
```

## Startup logs (first 50 lines) - Overseer
```
> @tentai/overseer@0.1.0 dev
> tsx src/main.ts

Vi Overseer initializing...
WORKSPACE_ROOT: E:\Tentai Ecosystem
AUDIT_LOG_DIR: E:\Tentai Ecosystem\.overseer-audit
{"level":30,"time":1767065187393,"pid":55700,"hostname":"Vi","msg":"Server listening at http://127.0.0.1:3200"}
✓ Vi Overseer listening on http://127.0.0.1:3200
  Authority: Process Lifecycle | Builds | Logs | TEST_MODE Gate
  TEST_MODE: false
```

## Startup logs (first 50 lines) - Sovereign
```
> sovereign@0.1.0 dev
> tsx src/server.ts


==================================================
🎛️  Sovereign listening on http://localhost:3001
📡 Connected to Vi at http://127.0.0.1:3100
==================================================
```

## Environment snapshot
```
OVERSEER_URL=
VI_API_URL=
v22.16.0
11.6.0
```
