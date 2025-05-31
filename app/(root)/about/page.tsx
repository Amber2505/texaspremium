import path from 'path'
import fs from 'fs'

export default function About() {
  const filePath = path.join(process.cwd(), 'app', '(root)', 'about', 'about.html');
  let fullHtmlContent = '';

  try {
      fullHtmlContent = fs.readFileSync(filePath, 'utf8');
    } catch (error) {
      console.error('Failed to read terms.html:', error);
      return (
        <div
          style={{
            padding: '40px 40px 40px 40px', // Top: 40px, Right: 40px, Bottom: 40px, Left: 40px
            maxWidth: '1200px',
            margin: '0 auto',
            color: 'inherit',
          }}
        >
          <h1>Terms of Service</h1>
          <p>Content could not be loaded. Please try again later.</p>
        </div>
      );
    }
  
    return (
      <div
        className="terms-content"
        style={{
          padding: '40px 40px 40px 40px', // Top: 40px, Right: 40px, Bottom: 40px, Left: 40px
          maxWidth: '1200px',
          margin: '0 auto',
        }}
        dangerouslySetInnerHTML={{ __html: fullHtmlContent }}
      />
    );
}
