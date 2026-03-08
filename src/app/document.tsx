export const Document: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => (
  <html lang="en">
    <head>
      <meta charSet="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <meta name="description" content="LiveSpark — real-time interactive presentations and polls. Create live polls, word clouds, and Q&A sessions instantly." />
      <title>LiveSpark | Real-time Interactive Polls</title>

      {/* Open Graph / Facebook */}
      <meta property="og:type" content="website" />
      <meta property="og:url" content="https://livespark.shortcircuit.workers.dev/" />
      <meta property="og:title" content="LiveSpark | Real-time Interactive Polls" />
      <meta property="og:description" content="Engage your audience with real-time word clouds, bar charts, and live feedback. Built with RedwoodSDK." />
      <meta property="og:image" content="https://livespark.shortcircuit.workers.dev/og-preview.png" />

      {/* Twitter */}
      <meta property="twitter:card" content="summary_large_image" />
      <meta property="twitter:url" content="https://livespark.shortcircuit.workers.dev/" />
      <meta property="twitter:title" content="LiveSpark | Real-time Interactive Polls" />
      <meta property="twitter:description" content="Engage your audience with real-time word clouds, bar charts, and live feedback." />
      <meta property="twitter:image" content="https://livespark.shortcircuit.workers.dev/og-preview.png" />

      <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link
        href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap"
        rel="stylesheet"
      />
      <link rel="stylesheet" href="/global.css" />
      <link rel="modulepreload" href="/src/client.tsx" />
    </head>
    <body>
      {children}
      <script>import("/src/client.tsx")</script>
    </body>
  </html>
);
