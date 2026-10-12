package com.mogogosiekautospares;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private LocalAssetServer localAssetServer;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        try {
            localAssetServer = new LocalAssetServer(getApplicationContext());
            localAssetServer.start();
        } catch (Exception exception) {
            throw new IllegalStateException("Could not start the local app server", exception);
        }

        super.onCreate(savedInstanceState);
    }

    @Override
    public void onDestroy() {
        if (localAssetServer != null) {
            localAssetServer.stop();
        }
        super.onDestroy();
    }
}
