package com.boscoautospares;

import android.content.Context;
import android.content.res.AssetManager;
import android.util.Log;
import android.webkit.MimeTypeMap;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.Arrays;
import java.util.Comparator;
import java.util.Date;
import java.util.Locale;
import java.util.Map;

import fi.iki.elonen.NanoHTTPD;

final class LocalAssetServer extends NanoHTTPD {
    private static final String ASSET_DIRECTORY = "public";
    private static final String BACKUP_PATTERN = "^backup-\\d{4}-\\d{2}-\\d{2}_\\d{2}-\\d{2}-\\d{2}-\\d{3}\\.json$";
    private static final int MAX_BACKUP_FILES = 5;
    private static final int MAX_REQUEST_BYTES = 50 * 1024 * 1024;
    private static final Response.IStatus PAYLOAD_TOO_LARGE = new Response.IStatus() {
        @Override
        public String getDescription() {
            return "Payload Too Large";
        }

        @Override
        public int getRequestStatus() {
            return 413;
        }
    };
    private final AssetManager assets;
    private final File overrideDirectory;
    private final File backupDirectory;

    LocalAssetServer(Context context) {
        super("127.0.0.1", 8080);
        assets = context.getAssets();
        File mediaDirectory = null;
        File[] mediaDirectories = context.getExternalMediaDirs();
        if (mediaDirectories != null) {
            for (File directory : mediaDirectories) {
                if (directory != null) {
                    File candidate = new File(directory, "POS");
                    if ((candidate.isDirectory() || candidate.mkdirs()) && candidate.canWrite()) {
                        mediaDirectory = directory;
                        break;
                    }
                }
            }
        }
        File appDirectory = new File(
            mediaDirectory == null ? context.getFilesDir() : mediaDirectory,
            "POS"
        );
        overrideDirectory = new File(appDirectory, "www");
        backupDirectory = new File(appDirectory, "Backups");
        if (
            (!overrideDirectory.isDirectory() && !overrideDirectory.mkdirs()) ||
            (!backupDirectory.isDirectory() && !backupDirectory.mkdirs())
        ) {
            throw new IllegalStateException("Could not create POS storage folders");
        }
    }

    @Override
    public void start() throws IOException {
        start(SOCKET_READ_TIMEOUT, false);
    }

    @Override
    public Response serve(IHTTPSession session) {
        String requestPath = session.getUri();
        if (requestPath != null && requestPath.startsWith("/api/")) {
            return serveApi(session, requestPath);
        }
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
        Response response = newChunkedResponse(
            Response.Status.OK,
            mimeType,
            new FileInputStream(file)
        );
        response.addHeader("Cache-Control", "no-store");
        return response;
    }

    private Response streamAsset(String relativePath) throws IOException {
        InputStream stream = assets.open(ASSET_DIRECTORY + "/" + relativePath);
        Response response = newChunkedResponse(
            Response.Status.OK,
            mimeType(relativePath),
            stream
        );
        response.addHeader("Cache-Control", "no-store");
        return response;
    }

    private Response serveApi(IHTTPSession session, String requestPath) {
        try {
            if ("/api/backups".equals(requestPath) && session.getMethod() == Method.GET) {
                return listBackups();
            }
            if ("/api/backups".equals(requestPath) && session.getMethod() == Method.POST) {
                return saveBackup(session);
            }
            String backupPrefix = "/api/backups/";
            if (
                requestPath.startsWith(backupPrefix) &&
                session.getMethod() == Method.GET
            ) {
                return readBackup(requestPath.substring(backupPrefix.length()));
            }
            return jsonResponse(Response.Status.NOT_FOUND, "{\"error\":\"Not found\"}");
        } catch (PayloadTooLargeException exception) {
            return jsonResponse(PAYLOAD_TOO_LARGE, "{\"error\":\"Backup exceeds the 50 MB limit\"}");
        } catch (IOException exception) {
            Log.e("LocalAssetServer", "Could not access backup storage", exception);
            return jsonResponse(Response.Status.INTERNAL_ERROR, "{\"error\":\"Could not access backup storage\"}");
        }
    }

    private Response listBackups() throws IOException {
        File[] backups = backupDirectory.listFiles(
            (directory, name) -> name.matches(BACKUP_PATTERN)
        );
        if (backups == null) {
            if (!backupDirectory.exists() && backupDirectory.mkdirs()) {
                backups = new File[0];
            } else if (!backupDirectory.isDirectory()) {
                throw new IOException("Could not create backup directory");
            } else {
                backups = new File[0];
            }
        }
        Arrays.sort(backups, Comparator.comparingLong(File::lastModified).reversed());
        JSONArray names = new JSONArray();
        for (File backup : backups) {
            names.put(backup.getName());
        }
        return jsonResponse(Response.Status.OK, names.toString());
    }

    private Response readBackup(String name) throws IOException {
        if (!name.matches(BACKUP_PATTERN)) {
            return jsonResponse(Response.Status.BAD_REQUEST, "{\"error\":\"Invalid backup name\"}");
        }
        File backup = new File(backupDirectory, name).getCanonicalFile();
        if (!isChildOf(backupDirectory.getCanonicalFile(), backup) || !backup.isFile()) {
            return jsonResponse(Response.Status.NOT_FOUND, "{\"error\":\"Backup not found\"}");
        }
        return streamFile(backup, "application/json");
    }

    private Response saveBackup(IHTTPSession session) throws IOException {
        String body = readRequestBody(session);
        try {
            JSONObject backup = new JSONObject(body);
            if (
                !"bosco-pos-backup".equals(backup.optString("format")) ||
                backup.optInt("version", -1) != 1 ||
                !(backup.opt("docs") instanceof JSONArray)
            ) {
                return jsonResponse(Response.Status.BAD_REQUEST, "{\"error\":\"Invalid POS database backup\"}");
            }
        } catch (JSONException exception) {
            return jsonResponse(Response.Status.BAD_REQUEST, "{\"error\":\"Invalid JSON backup\"}");
        }

        if (!backupDirectory.isDirectory() && !backupDirectory.mkdirs()) {
            throw new IOException("Could not create backup directory");
        }
        String timestamp = new SimpleDateFormat(
            "yyyy-MM-dd_HH-mm-ss-SSS",
            Locale.US
        ).format(new Date());
        File backup = new File(backupDirectory, "backup-" + timestamp + ".json");
        File temporary = new File(backupDirectory, backup.getName() + ".tmp");
        try (FileOutputStream output = new FileOutputStream(temporary)) {
            output.write(body.getBytes(StandardCharsets.UTF_8));
        }
        if (!temporary.renameTo(backup)) {
            temporary.delete();
            throw new IOException("Could not finish writing database backup");
        }
        pruneBackups();
        return jsonResponse(
            Response.Status.CREATED,
            "{\"name\":\"" + backup.getName() + "\"}"
        );
    }

    private String readRequestBody(IHTTPSession session) throws IOException {
        Map<String, String> headers = session.getHeaders();
        String contentLengthHeader = headers.get("content-length");
        if (contentLengthHeader == null) {
            throw new IOException("Missing content length");
        }
        final int contentLength;
        try {
            long parsedLength = Long.parseLong(contentLengthHeader);
            if (parsedLength > MAX_REQUEST_BYTES) {
                throw new PayloadTooLargeException();
            }
            if (parsedLength < 0) {
                throw new IOException("Invalid content length");
            }
            contentLength = (int) parsedLength;
        } catch (NumberFormatException exception) {
            throw new IOException("Invalid content length", exception);
        }

        ByteArrayOutputStream body = new ByteArrayOutputStream();
        byte[] buffer = new byte[8192];
        int total = 0;
        while (total < contentLength) {
            int read = session.getInputStream().read(
                buffer,
                0,
                Math.min(buffer.length, contentLength - total)
            );
            if (read == -1) {
                throw new IOException("Incomplete backup upload");
            }
            total += read;
            body.write(buffer, 0, read);
        }
        return body.toString(StandardCharsets.UTF_8.name());
    }

    private void pruneBackups() {
        File[] backups = backupDirectory.listFiles(
            (directory, name) -> name.matches(BACKUP_PATTERN)
        );
        if (backups == null) {
            return;
        }
        Arrays.sort(backups, Comparator.comparingLong(File::lastModified).reversed());
        for (int index = MAX_BACKUP_FILES; index < backups.length; index++) {
            if (!backups[index].delete()) {
                Log.w("LocalAssetServer", "Could not remove old backup " + backups[index].getName());
            }
        }
    }

    private Response jsonResponse(Response.IStatus status, String json) {
        Response response = newFixedLengthResponse(status, "application/json", json);
        response.addHeader("Cache-Control", "no-store");
        return response;
    }

    private static final class PayloadTooLargeException extends IOException {
        private static final long serialVersionUID = 1L;
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
