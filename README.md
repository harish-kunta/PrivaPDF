# PrivaPDF

A private, client-side PDF redaction tool that works entirely in your browser. Your documents never leave your device.

## Features

- 🔒 **Private & Secure** - PDF processing happens in your browser. PDF documents are never uploaded.
- ⚡ **Fast** - Instant redaction without server uploads or downloads.
- 🎨 **Easy to Use** - Intuitive interface for redacting sensitive information.
- 🖱️ **Drag & Drop** - Simply drag and drop your PDF files to get started.
- 📄 **Multi-page Support** - Handle PDFs with any number of pages.
- 🗑️ **Page Management** - Remove unwanted pages before downloading.
- 💾 **Flattened Export** - Export PDFs with redactions baked into page images.

## Getting Started

### Prerequisites

- Node.js (v14 or higher)
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/PrivaPDF.git
cd PrivaPDF
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm run dev
```

The application will be available at `http://localhost:5173` (or the port shown in your terminal).

## Usage

1. **Upload a PDF**: Click the upload area or drag and drop your PDF file
2. **Redact Content**: Click on areas you want to redact (selections appear as black boxes)
3. **Manage Pages**: Remove any pages you don't need
4. **Download**: Click the download button to save your redacted PDF

## Development

### Building for Production

```bash
npm run build
```

### Preview Production Build

```bash
npm preview
```

### Project Structure

```
PrivaPDF/
├── src/
│   ├── App.jsx           # Main application component
│   ├── main.jsx          # React entry point
│   └── styles.css        # Application styles
├── index.html            # HTML template
├── package.json          # Dependencies and scripts
├── vite.config.js        # Vite configuration
└── README.md            # This file
```

## Technologies Used

- **React** - UI framework
- **Vite** - Build tool and dev server
- **pdf-lib** - PDF manipulation library
- **PDF.js** - PDF rendering library

## Configure Cloudflare Web Analytics

Cloudflare Web Analytics is optional and loads only after a visitor accepts the analytics prompt. Without a beacon token, it stays inactive.

1. In the Cloudflare dashboard, open **Web Analytics**, add `https://harish-kunta.github.io/PrivaPDF/`, and create the site beacon. You do not need to move the site or change its DNS to Cloudflare.
2. In GitHub, open this repository's **Settings → Secrets and variables → Actions → Variables**, then create a repository variable named `VITE_CLOUDFLARE_BEACON_TOKEN` with the token Cloudflare provides. The token is included in the public website bundle, so treat it as a public identifier, not a secret.
3. Push a commit to `main` or manually run the **Deploy to GitHub Pages** workflow. The build reads that variable and embeds it in the site.
4. Visit the deployed site, choose **Allow analytics**, then check **Web Analytics** in Cloudflare after traffic has arrived. Visitors who decline are not measured.

For local development, put `VITE_CLOUDFLARE_BEACON_TOKEN=<your-beacon-token>` in `.env.local` (this file is ignored by Git), then restart Vite. Leave it unset to test with analytics off.

## Privacy

PrivaPDF respects your privacy:
- No PDF uploads or server-side document processing
- PDF contents, filenames, text, and redaction coordinates are not collected
- Optional Cloudflare Web Analytics is disabled by default and requires consent
- When enabled, Cloudflare measures aggregate page-visit traffic; analytics requests may include basic technical request information
- PDF contents, filenames, text, and redaction coordinates are never sent to the analytics provider
- All PDF processing is done locally in your browser
- See the [Privacy Policy](public/privacy.html) for details

## Security note

The exported PDF is flattened into page images with redactions painted into the pixels. This removes selectable text from the export and is intended to prevent the original content from remaining underneath a redaction overlay. Always inspect an exported document before sharing it.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Contributing

Contributions are welcome! Feel free to:
1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Support

If you encounter any issues or have suggestions for improvements, please open an issue on GitHub.

## Disclaimer

This tool is provided as-is. Users are responsible for ensuring that redactions are complete and meet their requirements. Always verify redacted PDFs before sharing sensitive documents.

---

Made with ❤️ for privacy-conscious users
