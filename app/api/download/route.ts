// app/api/download/route.ts
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const url = searchParams.get("url");
    let filename = searchParams.get("filename") || "download";

    if (!url) {
      return NextResponse.json({ error: "URL is required" }, { status: 400 });
    }

    // Fetch the file
    const response = await fetch(url);
    
    if (!response.ok) {
      return NextResponse.json(
        { error: "Failed to fetch file" },
        { status: response.status }
      );
    }

    // Get the content type from the response
    const contentType = response.headers.get("content-type") || "application/octet-stream";
    
    // If filename doesn't have extension, try to add one based on content type
    if (!filename.includes('.')) {
      const extMap: Record<string, string> = {
        'image/jpeg': '.jpg',
        'image/jpg': '.jpg',
        'image/png': '.png',
        'image/gif': '.gif',
        'image/webp': '.webp',
        'video/mp4': '.mp4',
        'video/quicktime': '.mov',
        'audio/mpeg': '.mp3',
        'audio/wav': '.wav',
        'application/pdf': '.pdf',
      };
      const ext = extMap[contentType.split(';')[0]] || '';
      filename = filename + ext;
    }
    
    // Get the blob data
    const blob = await response.blob();
    const arrayBuffer = await blob.arrayBuffer();

    // Sanitize filename for Content-Disposition header
    const safeFilename = filename.replace(/[^\w\s.-]/g, '_');

    // Return the file with proper headers for download
    return new NextResponse(arrayBuffer, {
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${safeFilename}"`,
        "Content-Length": arrayBuffer.byteLength.toString(),
        "Cache-Control": "no-cache",
      },
    });
  } catch (error: unknown) {
    console.error("Download proxy error:", error);
    const message = error instanceof Error ? error.message : "Download failed";
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}