import { defineConfig } from 'wxt';

export default defineConfig({
  manifest: {
    name: 'Mingbai 明白',
    description:
      'Select Chinese text to read it with pinyin, per-word meanings and an English translation.',
    permissions: ['storage'],
    // Requested at save time for the one API host the user configures.
    optional_host_permissions: ['https://*/*', 'http://*/*'],
    action: { default_title: 'Mingbai settings' },
  },
});
