package com.boscoautospares;

import android.content.Context;
import android.print.PageRange;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintDocumentInfo;
import android.print.PrintManager;
import android.os.Bundle;
import android.os.CancellationSignal;
import android.os.ParcelFileDescriptor;
import android.util.Base64;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;

@CapacitorPlugin(name = "ReceiptPrinter")
public final class ReceiptPrinterPlugin extends Plugin {
    private static final int MAX_PDF_BYTES = 20 * 1024 * 1024;

    @PluginMethod
    public void printPdf(PluginCall call) {
        String encodedPdf = call.getString("base64");
        if (encodedPdf == null || encodedPdf.isEmpty()) {
            call.reject("Receipt PDF data is missing.");
            return;
        }

        final byte[] pdfBytes;
        try {
            pdfBytes = Base64.decode(encodedPdf, Base64.DEFAULT);
        } catch (IllegalArgumentException exception) {
            call.reject("Receipt PDF data is invalid.", exception);
            return;
        }
        if (pdfBytes.length == 0 || pdfBytes.length > MAX_PDF_BYTES) {
            call.reject("Receipt PDF must be smaller than 20 MB.");
            return;
        }

        final File pdfFile;
        try {
            pdfFile = File.createTempFile("pos-receipt-", ".pdf", getContext().getCacheDir());
            try (FileOutputStream output = new FileOutputStream(pdfFile)) {
                output.write(pdfBytes);
            }
        } catch (IOException exception) {
            call.reject("Could not prepare the receipt for printing.", exception);
            return;
        }

        PrintManager printManager =
            (PrintManager) getContext().getSystemService(Context.PRINT_SERVICE);
        if (printManager == null) {
            pdfFile.delete();
            call.reject("Android printing is not available on this device.");
            return;
        }

        String title = call.getString("title", "POS receipt");
        try {
            printManager.print(title, new ReceiptPrintAdapter(pdfFile), null);
            call.resolve();
        } catch (RuntimeException exception) {
            pdfFile.delete();
            Log.e("ReceiptPrinter", "Could not open Android print dialog", exception);
            call.reject("Could not open the Android print dialog.", exception);
        }
    }

    private static final class ReceiptPrintAdapter extends PrintDocumentAdapter {
        private final File pdfFile;

        ReceiptPrintAdapter(File pdfFile) {
            this.pdfFile = pdfFile;
        }

        @Override
        public void onLayout(
            PrintAttributes oldAttributes,
            PrintAttributes newAttributes,
            CancellationSignal cancellationSignal,
            LayoutResultCallback callback,
            Bundle extras
        ) {
            if (cancellationSignal.isCanceled()) {
                callback.onLayoutCancelled();
                return;
            }

            PrintDocumentInfo documentInfo = new PrintDocumentInfo.Builder(pdfFile.getName())
                .setContentType(PrintDocumentInfo.CONTENT_TYPE_DOCUMENT)
                .setPageCount(PrintDocumentInfo.PAGE_COUNT_UNKNOWN)
                .build();
            callback.onLayoutFinished(documentInfo, true);
        }

        @Override
        public void onWrite(
            PageRange[] pages,
            ParcelFileDescriptor destination,
            CancellationSignal cancellationSignal,
            WriteResultCallback callback
        ) {
            if (cancellationSignal.isCanceled()) {
                callback.onWriteCancelled();
                return;
            }

            try (
                FileInputStream input = new FileInputStream(pdfFile);
                FileOutputStream output = new FileOutputStream(destination.getFileDescriptor())
            ) {
                byte[] buffer = new byte[8192];
                int read;
                while ((read = input.read(buffer)) != -1) {
                    if (cancellationSignal.isCanceled()) {
                        callback.onWriteCancelled();
                        return;
                    }
                    output.write(buffer, 0, read);
                }
                output.flush();
                callback.onWriteFinished(new PageRange[] { PageRange.ALL_PAGES });
            } catch (IOException exception) {
                callback.onWriteFailed(exception.getMessage());
            } finally {
                try {
                    destination.close();
                } catch (IOException exception) {
                    Log.w("ReceiptPrinter", "Could not close print destination", exception);
                }
            }
        }

        @Override
        public void onFinish() {
            if (pdfFile.exists() && !pdfFile.delete()) {
                Log.w("ReceiptPrinter", "Could not remove temporary receipt PDF");
            }
        }
    }
}
