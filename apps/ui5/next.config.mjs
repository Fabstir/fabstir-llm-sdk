/** @type {import('next').NextConfig} */
const nextConfig = {
  /* config options here */

  // Output as standalone
  output: 'standalone',

  // Transpile SDK package to enable hot reload for symlinked workspace packages
  transpilePackages: ['@fabstir/sdk-core'],

  // Configure webpack to handle node: protocols for the S5 library
  webpack: (config, { isServer, webpack }) => {
    if (!isServer) {
      // Replace node: protocol imports with empty modules on client
      config.plugins.push(
        new webpack.NormalModuleReplacementPlugin(
          /^node:/,
          (resource) => {
            resource.request = resource.request.replace(/^node:/, '');
          }
        )
      );

      // Provide fallbacks for Node.js built-in modules
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        crypto: false,
        stream: false,
        http: false,
        https: false,
        zlib: false,
        path: false,
        os: false,
        assert: false,
        buffer: false,
        url: false,
        util: false,
        querystring: false,
        async_hooks: false,
        perf_hooks: false,
        console: false,
        events: false,
        dns: false,
        dgram: false,
        cluster: false,
        child_process: false,
        worker_threads: false,
        timers: false,
        process: false,
        string_decoder: false,
        vm: false,
        v8: false,
        inspector: false,
        sqlite: false,
        diagnostics_channel: false,
        'util/types': false,
        http2: false,
      };

      // Also add alias resolution for modules with paths
      config.resolve.alias = {
        ...config.resolve.alias,
        'util/types': false,
      };
    }
    return config;
  },
};

export default nextConfig;
