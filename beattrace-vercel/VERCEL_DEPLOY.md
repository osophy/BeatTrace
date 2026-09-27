# BeatTrace deployment

## Recommended path: Vercel

1. Create a GitHub repository and upload this project folder.
2. Open Vercel and choose **Add New Project**.
3. Import the BeatTrace GitHub repository.
4. Keep the detected framework settings, then set:
   - Install command: `npm ci`
   - Build command: `npm run build`
5. Click **Deploy**.

The site uses browser-local audio. No API key or database is required for this prototype.

## Alternative: Netlify

Import the same GitHub repository in Netlify and use:

- Build command: `npm run build`
- Publish directory: `dist/client`

For the current vinext/Cloudflare runtime, Vercel is the preferred first attempt. If the host reports an adapter error, the project needs a small host-specific adapter change before deployment.
