import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import SystemBoundaryView from './SystemBoundaryView';

describe('SystemBoundaryView', () => {
  it('renders empty state when no data', () => {
    render(<SystemBoundaryView inputs={[]} outputs={[]} boundary_portals={[]} />);
    expect(screen.getByText('System boundary data will appear during a build')).toBeInTheDocument();
  });

  it('renders inputs', () => {
    render(
      <SystemBoundaryView
        inputs={[{ name: 'Keyboard input', type: 'user_input' }]}
        outputs={[]}
        boundary_portals={[]}
      />,
    );
    expect(screen.getByText('Keyboard input')).toBeInTheDocument();
    expect(screen.getByText('Inputs')).toBeInTheDocument();
  });

  it('renders outputs', () => {
    render(
      <SystemBoundaryView
        inputs={[]}
        outputs={[{ name: 'Game display', type: 'display' }]}
        boundary_portals={[]}
      />,
    );
    expect(screen.getByText('Game display')).toBeInTheDocument();
    expect(screen.getByText('Outputs')).toBeInTheDocument();
  });

  it('renders boundary portals', () => {
    render(
      <SystemBoundaryView
        inputs={[]}
        outputs={[{ name: 'Data to API', type: 'data_output' }]}
        boundary_portals={['Weather API']}
      />,
    );
    expect(screen.getByText('Weather API')).toBeInTheDocument();
    expect(screen.getByText('Your System')).toBeInTheDocument();
  });

  it('renders system label', () => {
    render(
      <SystemBoundaryView
        inputs={[{ name: 'Click', type: 'user_input' }]}
        outputs={[{ name: 'Screen', type: 'display' }]}
        boundary_portals={[]}
      />,
    );
    expect(screen.getByText('Your System')).toBeInTheDocument();
  });

  it('renders multiple inputs and outputs', () => {
    render(
      <SystemBoundaryView
        inputs={[
          { name: 'Keyboard', type: 'user_input' },
          { name: 'Sensor data', type: 'hardware_signal', source: 'ESP32' },
        ]}
        outputs={[
          { name: 'LED control', type: 'hardware_command', source: 'ESP32' },
          { name: 'Dashboard', type: 'display' },
        ]}
        boundary_portals={['MQTT Broker']}
      />,
    );
    expect(screen.getByText('Keyboard')).toBeInTheDocument();
    expect(screen.getByText('Sensor data')).toBeInTheDocument();
    expect(screen.getByText('LED control')).toBeInTheDocument();
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('MQTT Broker')).toBeInTheDocument();
  });
});
