"use client";

export default function TermsClient({ htmlContent }: { htmlContent: string }) {
  return (
    <div className="min-h-screen bg-white">
      {/* Updated styles for full-width layout */}
      <style jsx>{`
        .terms-content {
          max-width: 1200px;
          padding: 40px 60px;
          margin: 0 auto;
          background-color: #ffffff;
          font-family: Arial, sans-serif;
          font-size: 11pt;
          color: #000000;
          line-height: 1.5;
        }

        .terms-content h1 {
          padding-top: 20pt;
          color: #000000;
          font-size: 20pt;
          padding-bottom: 6pt;
          font-family: Arial;
          line-height: 1.15;
          font-weight: 700;
          text-align: left;
          margin: 0;
        }

        .terms-content h2 {
          padding-top: 18pt;
          color: #000000;
          font-size: 16pt;
          padding-bottom: 6pt;
          font-family: Arial;
          line-height: 1.15;
          font-weight: 700;
          text-align: left;
          margin: 0;
        }

        .terms-content h3 {
          padding-top: 16pt;
          color: #434343;
          font-size: 14pt;
          padding-bottom: 4pt;
          font-family: Arial;
          line-height: 1.15;
          font-weight: 700;
          text-align: left;
          margin: 0;
        }

        .terms-content p {
          margin: 0;
          color: #000000;
          font-size: 11pt;
          font-family: Arial;
          line-height: 1.5;
          padding-top: 0pt;
          padding-bottom: 0pt;
          text-align: left;
        }

        .terms-content ul,
        .terms-content ol {
          margin: 0;
          padding: 0;
          list-style-type: none;
        }

        .terms-content li {
          color: #000000;
          font-size: 11pt;
          font-family: Arial;
          margin-left: 36pt;
          padding-top: 11pt;
          padding-bottom: 11pt;
          line-height: 1.5;
          text-align: left;
        }

        .terms-content li:before {
          content: "• ";
          margin-right: 8pt;
        }

        .terms-content a {
          color: #3030f1;
          text-decoration: none;
        }

        .terms-content a:hover {
          text-decoration: underline;
        }

        /* Specific styling classes from Google Docs */
        .terms-content .c2 {
          background-color: #ffffff;
          padding-top: 0pt;
          padding-bottom: 0pt;
          line-height: 1.5;
          text-align: left;
        }

        .terms-content .c3 {
          color: #000000;
          font-weight: 700;
          font-size: 14.5pt;
          font-family: Arial;
        }

        .terms-content .c4 {
          color: #595959;
          font-size: 10.5pt;
          font-family: Arial;
        }

        .terms-content .c5 {
          color: #595959;
          font-size: 11pt;
          font-family: Arial;
        }

        .terms-content .c13 {
          font-weight: 700;
        }

        .terms-content .c18 {
          background-color: #ffffff;
          padding-top: 18pt;
          padding-bottom: 4pt;
          line-height: 1.5;
          text-align: left;
        }

        .terms-content .c29 {
          color: #000000;
          font-size: 19.5pt;
        }

        .terms-content .c30 {
          padding-top: 21pt;
          padding-bottom: 21pt;
          line-height: 1.5;
          text-align: left;
        }

        /* Responsive design */
        @media (max-width: 768px) {
          .terms-content {
            padding: 20px;
            max-width: 100%;
          }

          .terms-content h1 {
            font-size: 24px;
          }

          .terms-content h2 {
            font-size: 20px;
          }

          .terms-content h3 {
            font-size: 18px;
          }

          .terms-content p {
            font-size: 14px;
          }

          .terms-content li {
            margin-left: 20px;
            font-size: 14px;
          }
        }
      `}</style>

      <div
        className="terms-content"
        dangerouslySetInnerHTML={{ __html: htmlContent }}
      />
    </div>
  );
}
