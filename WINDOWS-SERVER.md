# Windows Server deployment

This release is a static React application hosted by IIS at the root of a website, for example `https://erp.example.com/`. Node.js is needed only on the build computer. No Node.js service or Docker runtime is required on the server.

The current application uses browser storage and seeded data. This package does not include a backend API, shared database, or server-side authentication. Data stored in one browser is not automatically shared with other users.

## Create the package

With the project's supported Node.js version and dependencies installed, run:

```powershell
npm ci
npm run publish:windows
```

The ZIP and SHA256 checksum are written to `releases`. The ZIP contains `index.html`, `web.config`, and production assets directly at its root.

## Install on Windows Server

1. In an Administrator PowerShell window, enable IIS:

   ```powershell
   Install-WindowsFeature Web-Server, Web-Static-Content, Web-Default-Doc, Web-Http-Errors, Web-Stat-Compression -IncludeManagementTools
   ```

2. Copy the release ZIP to the server and extract it into a new release directory, such as `C:\inetpub\IntegratedERP\release-1`. Confirm that `index.html` and `web.config` are directly inside that directory.
3. In IIS Manager, create an application pool named `IntegratedERP`, with .NET CLR version set to **No Managed Code**.
4. Add a website named `IntegratedERP`, select that pool, and set its physical path to the extracted directory. Use an available port and your server hostname. Use a dedicated website root; the current asset URLs assume `/`.
5. Give `IIS AppPool\IntegratedERP` read and execute access to the release directory. In Authentication, enable Anonymous Authentication and edit it to use the application pool identity.
6. Configure an HTTPS binding with your server certificate, DNS, and the appropriate Windows/network firewall rule for your chosen port.
7. Open the site from a client computer. Check sign-in, employee pages, photos, and a browser refresh. In browser developer tools, confirm the JavaScript and CSS requests return HTTP 200.

The app currently switches views internally, so IIS URL Rewrite is not required. If browser path routing is introduced, add a suitable SPA rewrite rule at that time.

## Upgrade and rollback

Extract each new ZIP into a new release directory and grant the same read permissions. Change the IIS website physical path to that directory. Keep the previous directory for rollback; switch the physical path back if necessary. Browser storage remains on the client and is not backed up by copying the server files.

If IIS returns HTTP 500.19, inspect the configuration error: the server administrator may need to allow the relevant `web.config` sections. For missing static assets, confirm Static Content is installed and the site uses the extracted ZIP root.

Reference: [Microsoft: Build a Static Website on IIS](https://learn.microsoft.com/en-us/iis/manage/creating-websites/scenario-build-a-static-website-on-iis).
