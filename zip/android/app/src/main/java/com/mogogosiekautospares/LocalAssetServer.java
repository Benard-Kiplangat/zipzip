package com.mogogosiekautospares;

import android.content.Context;
import android.content.res.AssetManager;
import android.webkit.MimeTypeMap;

import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.Locale;

import fi.iki.elonen.NanoHTTPD;

final class LocalAssetServer extends NanoHTTPD {
    private static final String ASSET_DIRECTORY = "public";
    private final AssetManager assets;
    private final File overrideDirectory;

    LocalAssetServer(Context context) {
        super("127.0.0.1", 8080);
        assets = context.getAssets();
        overrideDirectory = new File(context.getFilesDir(), "www");
    }

    void start() throws IOException {
        start(SOCKET_READ_TIMEOUT, false);
    }

    @Override
    public Response serve(IHTTPSession session) {
        String requestPath = session.getUri();
        if (requestPath == null || requestPath.equals("/")) {
            requestPath = "/index.html";
        }

        String relativePath = requestPath.startsWith("/")
            ? requestPath.substring(1)
            : requestPath;
        if (relativePath.contains("\\") || relativePath.contains("..")) {
            return newFixedLengthResponse(Response.Status.FORBIDDEN, MIME_PLAINTEXT, "Forbidden");
        }

        try {
            File overrideFile = new File(overrideDirectory, relativePath).getCanonicalFile();
            if (isChildOf(overrideDirectory.getCanonicalFile(), overrideFile) && overrideFile.isFile()) {
                return streamFile(overrideFile, mimeType(relativePath));
            }

            return streamAsset(relativePath);
        } catch (IOException exception) {
            if (!relativePath.equals("index.html")) {
                try {
                    return streamAsset("index.html");
                } catch (IOException ignored) {
                    return newFixedLengthResponse(
                        Response.Status.NOT_FOUND,
                        MIME_PLAINTEXT,
                        "Application asset not found"
                    );
                }
            }
            return newFixedLengthResponse(
                Response.Status.INTERNAL_ERROR,
                MIME_PLAINTEXT,
                "Could not read application asset"
            );
        }
    }

    private Response streamFile(File file, String mimeType) throws IOException {
        return newChunkedResponse(
            Response.Status.OK,
            mimeType,
            new FileInputStream(file)
        );
    }

    private Response streamAsset(String relativePath) throws IOException {
        InputStream stream = assets.open(ASSET_DIRECTORY + "/" + relativePath);
        return newChunkedResponse(
            Response.Status.OK,
            mimeType(relativePath),
            stream
        );
    }

    private static boolean isChildOf(File directory, File candidate) {
        return candidate.getPath().startsWith(directory.getPath() + File.separator);
    }

    private static String mimeType(String path) {
        int extensionSeparator = path.lastIndexOf('.');
        if (extensionSeparator < 0) {
            return "application/octet-stream";
        }

        String extension = path.substring(extensionSeparator + 1).toLowerCase(Locale.ROOT);
        String mimeType = MimeTypeMap.getSingleton().getMimeTypeFromExtension(extension);
        if ("js".equals(extension)) {
            return "application/javascript";
        }
        if ("json".equals(extension) || "webmanifest".equals(extension)) {
            return "application/json";
        }
        return mimeType == null ? "application/octet-stream" : mimeType;
    }
}
