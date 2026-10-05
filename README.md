# PrivaPDF

A private, client-side PDF redaction tool that works entirely in your browser. Your documents never leave your device.

## Features

- 🔒 **Private & Secure** - All processing happens in your browser. No data is sent to any server.
- ⚡ **Fast** - Instant redaction without server uploads or downloads.
- 🎨 **Easy to Use** - Intuitive interface for redacting sensitive information.
- 🖱️ **Drag & Drop** - Simply drag and drop your PDF files to get started.
- 📄 **Multi-page Support** - Handle PDFs with any number of pages.
- 🗑️ **Page Management** - Remove unwanted pages before downloading.
- 💾 **Download** - Export your redacted PDFs with a single click.

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

## Privacy

PrivaPDF respects your privacy:
- No analytics or tracking
- No server-side processing
- No data collection
- All processing is done locally in your browser
- Your PDFs never leave your device

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
