import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ServiceManager } from '../../src/daemon/service';
import * as path from 'path';

vi.mock('fs');
vi.mock('child_process');

describe('Service Management', () => {
  let serviceManager: ServiceManager;
  let mockFs: any;
  let mockChildProcess: any;

  beforeEach(async () => {
    mockFs = await import('fs');
    mockChildProcess = await import('child_process');

    serviceManager = new ServiceManager();

    vi.mocked(mockFs.writeFileSync).mockImplementation(() => {});
    vi.mocked(mockFs.existsSync).mockReturnValue(false);
    vi.mocked(mockFs.mkdirSync).mockImplementation(() => undefined as any);
    vi.mocked(mockFs.chmodSync).mockImplementation(() => {});
    vi.mocked(mockFs.unlinkSync).mockImplementation(() => {});
    vi.mocked(mockChildProcess.execSync).mockReturnValue(Buffer.from('success'));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('generateSystemdService', () => {
    it('should generate systemd service file', () => {
      const config = {
        name: 'fabstir-host',
        description: 'Fabstir Host Service',
        execPath: '/usr/local/bin/fabstir-host',
        user: 'fabstir',
        workingDirectory: '/opt/fabstir',
        environment: {
          NODE_ENV: 'production',
          PORT: '3000'
        }
      };

      const serviceContent = serviceManager.generateSystemdService(config);

      expect(serviceContent).toContain('[Unit]');
      expect(serviceContent).toContain('Description=Fabstir Host Service');
      expect(serviceContent).toContain('[Service]');
      expect(serviceContent).toContain('ExecStart=/usr/local/bin/fabstir-host');
      expect(serviceContent).toContain('User=fabstir');
      expect(serviceContent).toContain('WorkingDirectory=/opt/fabstir');
      expect(serviceContent).toContain('Environment="NODE_ENV=production"');
      expect(serviceContent).toContain('Environment="PORT=3000"');
      expect(serviceContent).toContain('Restart=always');
      expect(serviceContent).toContain('[Install]');
      expect(serviceContent).toContain('WantedBy=multi-user.target');
    });

    it('should include restart policy', () => {
      const config = {
        name: 'fabstir-host',
        execPath: '/usr/local/bin/fabstir-host',
        restartPolicy: 'on-failure' as const,
        restartSec: 10
      };

      const serviceContent = serviceManager.generateSystemdService(config);

      expect(serviceContent).toContain('Restart=on-failure');
      expect(serviceContent).toContain('RestartSec=10');
    });
  });

  describe('installSystemdService', () => {
    it('should write service file to systemd directory', async () => {
      const config = {
        name: 'fabstir-host',
        execPath: '/usr/local/bin/fabstir-host'
      };

      await serviceManager.installSystemdService(config);

      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        '/etc/systemd/system/fabstir-host.service',
        expect.stringContaining('[Unit]'),
        'utf8'
      );

      expect(mockChildProcess.execSync).toHaveBeenCalledWith('systemctl daemon-reload');
    });

    it('should enable service if requested', async () => {
      const config = {
        name: 'fabstir-host',
        execPath: '/usr/local/bin/fabstir-host',
        enable: true
      };

      await serviceManager.installSystemdService(config);

      expect(mockChildProcess.execSync).toHaveBeenCalledWith('systemctl enable fabstir-host.service');
    });
  });

  describe('uninstallSystemdService', () => {
    it('should stop and remove service', async () => {
      vi.mocked(mockFs.existsSync).mockReturnValue(true);

      await serviceManager.uninstallSystemdService('fabstir-host');

      expect(mockChildProcess.execSync).toHaveBeenCalledWith('systemctl stop fabstir-host.service');
      expect(mockChildProcess.execSync).toHaveBeenCalledWith('systemctl disable fabstir-host.service');
      expect(mockFs.unlinkSync).toHaveBeenCalledWith('/etc/systemd/system/fabstir-host.service');
      expect(mockChildProcess.execSync).toHaveBeenCalledWith('systemctl daemon-reload');
    });
  });

  describe('generateInitScript', () => {
    it('should generate init.d script', () => {
      const config = {
        name: 'fabstir-host',
        execPath: '/usr/local/bin/fabstir-host',
        pidFile: '/var/run/fabstir-host.pid',
        user: 'fabstir'
      };

      const script = serviceManager.generateInitScript(config);

      expect(script).toContain('#!/bin/sh');
      expect(script).toContain('# fabstir-host');
      expect(script).toContain('start)');
      expect(script).toContain('stop)');
      expect(script).toContain('restart)');
      expect(script).toContain('status)');
      expect(script).toContain('/usr/local/bin/fabstir-host');
      expect(script).toContain('/var/run/fabstir-host.pid');
    });
  });

  describe('service control', () => {
    it('should start service', async () => {
      // Mock hasSystemd to return true
      vi.mocked(mockFs.existsSync).mockImplementation((path) =>
        path === '/run/systemd/system'
      );

      await serviceManager.startService('fabstir-host');

      expect(mockChildProcess.execSync).toHaveBeenCalledWith('systemctl start fabstir-host.service');
    });

    it('should stop service', async () => {
      // Mock hasSystemd to return true
      vi.mocked(mockFs.existsSync).mockImplementation((path) =>
        path === '/run/systemd/system'
      );

      await serviceManager.stopService('fabstir-host');

      expect(mockChildProcess.execSync).toHaveBeenCalledWith('systemctl stop fabstir-host.service');
    });

    it('should restart service', async () => {
      // Mock hasSystemd to return true
      vi.mocked(mockFs.existsSync).mockImplementation((path) =>
        path === '/run/systemd/system'
      );

      await serviceManager.restartService('fabstir-host');

      expect(mockChildProcess.execSync).toHaveBeenCalledWith('systemctl restart fabstir-host.service');
    });

    it('should get service status', async () => {
      vi.mocked(mockChildProcess.execSync).mockReturnValue(
        Buffer.from('● fabstir-host.service - Fabstir Host\n   Active: active (running)')
      );

      const status = await serviceManager.getServiceStatus('fabstir-host');

      expect(status).toEqual({
        active: true,
        running: true,
        status: expect.stringContaining('active (running)')
      });
    });
  });

  describe('cross-platform support', () => {
    it('should detect systemd availability', async () => {
      vi.mocked(mockFs.existsSync).mockImplementation((path) =>
        path === '/run/systemd/system'
      );

      const hasSystemd = serviceManager.hasSystemd();

      expect(hasSystemd).toBe(true);
    });

    it('should fall back to init.d on non-systemd systems', async () => {
      vi.mocked(mockFs.existsSync).mockImplementation((path) =>
        path !== '/run/systemd/system'
      );

      const config = {
        name: 'fabstir-host',
        execPath: '/usr/local/bin/fabstir-host'
      };

      await serviceManager.installService(config);

      expect(mockFs.writeFileSync).toHaveBeenCalledWith(
        '/etc/init.d/fabstir-host',
        expect.stringContaining('#!/bin/sh'),
        'utf8'
      );
      expect(mockFs.chmodSync).toHaveBeenCalledWith('/etc/init.d/fabstir-host', '755');
    });
  });

  describe('health monitoring', () => {
    it('should configure health checks', () => {
      const config = {
        name: 'fabstir-host',
        execPath: '/usr/local/bin/fabstir-host',
        healthCheck: {
          interval: 30,
          timeout: 5,
          retries: 3,
          command: 'curl -f http://localhost:3000/health'
        }
      };

      const serviceContent = serviceManager.generateSystemdService(config);

      expect(serviceContent).toContain('ExecStartPost=/bin/sh -c');
      expect(serviceContent).toContain('curl -f http://localhost:3000/health');
    });
  });
});