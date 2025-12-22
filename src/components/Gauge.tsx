import * as React from 'react';
import powerbi from "powerbi-visuals-api";
import DataView = powerbi.DataView;
import IViewport = powerbi.IViewport;
import { GaugeBackground } from './GaugeBackground';
import { GaugeRanges } from './GaugeRanges';
import { PerformanceArc } from './PerformanceArc';
import { ValueMarker } from './ValueMarker';
import { CenterText } from './CenterText';
import { DataFormat, GaugeData, GaugeSettings } from './types';

interface Props {
    dataView: DataView | null;
    viewport: IViewport;
    settings: GaugeSettings;
}

interface State {
    gaugeData: GaugeData | null;
}

export default class Gauge extends React.Component<Props, State> {
    state: State = {
        gaugeData: null
    };

    componentDidMount() {
        this.updateGaugeData();
    }

    componentDidUpdate(prevProps: Props) {
        if (prevProps.dataView !== this.props.dataView || prevProps.settings !== this.props.settings) {
            this.updateGaugeData();
        }
    }

    private updateGaugeData() {
        const { dataView, settings } = this.props;
        
        if (!dataView) {
            this.setState({ gaugeData: null });
            return;
        }

        let value = 0;
        let min = settings.startAngle;
        let max = settings.endAngle;
        let lowThreshold = 0;
        let midThreshold = 0;
        let hasValidData = false;

        const extractValue = (categorical: any, roleName: string): number | null => {
            if (categorical.values) {
                const valueItem = categorical.values.filter((v: any) => v.source.roles[roleName])[0];
                if (valueItem && valueItem.values[0] != null) {
                    return typeof valueItem.values[0] === 'number' ? valueItem.values[0] : parseFloat(valueItem.values[0].toString());
                }
            }

            if (categorical.categories) {
                const categoryItem = categorical.categories.filter((c: any) => c.source.roles[roleName])[0];
                if (categoryItem && categoryItem.values[0] != null) {
                    const val = categoryItem.values[0];
                    return typeof val === 'number' ? val : parseFloat(val.toString());
                }
            }

            return null;
        };

        if (dataView.categorical) {
            const categorical = dataView.categorical;

            const measureVal = extractValue(categorical, 'measure');
            if (measureVal !== null) {
                value = measureVal;
                hasValidData = true;
            }

            const minVal = extractValue(categorical, 'min');
            if (minVal !== null) min = minVal;

            const maxVal = extractValue(categorical, 'max');
            if (maxVal !== null) max = maxVal;

            const lowThresholdVal = extractValue(categorical, 'lowThreshold');
            if (lowThresholdVal !== null) lowThreshold = lowThresholdVal;

            const midThresholdVal = extractValue(categorical, 'midThreshold');
            if (midThresholdVal !== null) midThreshold = midThresholdVal;

        } else if (dataView.single && dataView.single.value != null) {
            value = typeof dataView.single.value === 'number' ? dataView.single.value : parseFloat(dataView.single.value.toString());
            hasValidData = true;
        }

        if (min >= max) {
            max = min + 100;
        }

        if (value < min) value = min;
        if (value > max) value = max;

        let dataFormat: DataFormat = {
            decimalPlaces: null,
            isPercentage: false
        };

        if (dataView.categorical && dataView.categorical.values) {
            const measureItem = dataView.categorical.values.filter((v: any) => v.source.roles['measure'])[0];
            if (measureItem && measureItem.source.format) {
                const format = measureItem.source.format;
                dataFormat.isPercentage = format.includes('%');
                const decimalMatch = format.match(/\.([0#]+)/);
                if (decimalMatch) {
                    dataFormat.decimalPlaces = decimalMatch[1].length;
                } else if (format) {
                    dataFormat.decimalPlaces = 0;
                }
            }
        }

        if (dataFormat.decimalPlaces === null && max - min <= 1 && max - min > 0) {
            dataFormat.decimalPlaces = 2;
        }

        this.setState({
            gaugeData: {
                value,
                min,
                max,
                lowThreshold,
                midThreshold,
                hasValidData,
                dataFormat
            }
        });
    }

    private createScale(min: number, max: number, startAngle: number, endAngle: number) {
        return (value: number): number => {
            const normalizedValue = Math.max(min, Math.min(max, value));
            const ratio = (normalizedValue - min) / (max - min);
            return startAngle + ratio * (endAngle - startAngle);
        };
    }

    private getPerformanceColor(value: number, lowThreshold: number, midThreshold: number): string {
        const { settings } = this.props;
        
        if (value <= lowThreshold) {
            return settings.lowColor;
        } else if (value <= midThreshold) {
            return settings.mediumColor;
        } else {
            return settings.highColor;
        }
    }

    render() {
        const { viewport, settings } = this.props;
        const { gaugeData } = this.state;

        if (!gaugeData || !gaugeData.hasValidData) {
            return (
                <div style={{ 
                    width: '100%', 
                    height: '100%', 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    color: '#666666',
                    fontSize: '16px'
                }}>
                    No hay datos disponibles
                </div>
            );
        }

        const width = viewport.width;
        const height = viewport.height;

        if (width <= 0 || height <= 0) {
            return null;
        }

        const size = Math.min(width, height);
        const radius = (size / 2) / 0.95 - settings.thickness / 2;
        const startAngleRad = settings.startAngle * (Math.PI / 180);
        const endAngleRad = settings.endAngle * (Math.PI / 180);

        const scale = this.createScale(gaugeData.min, gaugeData.max, startAngleRad, endAngleRad);
        const performanceColor = this.getPerformanceColor(
            gaugeData.value, 
            gaugeData.lowThreshold, 
            gaugeData.midThreshold
        );

        return (
            <svg width={width} height={height}>
                <g transform={`translate(${width / 2}, ${height / 2})`}>
                    <GaugeBackground
                        radius={radius}
                        startAngle={startAngleRad}
                        endAngle={endAngleRad}
                        thickness={settings.thickness}
                    />
                    
                    {settings.showRanges && (
                        <GaugeRanges
                            radius={radius}
                            startAngle={startAngleRad}
                            endAngle={endAngleRad}
                            thickness={settings.thickness}
                            lowThreshold={gaugeData.lowThreshold}
                            midThreshold={gaugeData.midThreshold}
                            lowColor={settings.lowColor}
                            mediumColor={settings.mediumColor}
                            highColor={settings.highColor}
                            scale={scale}
                        />
                    )}
                    
                    {!settings.showRanges && (
                        <PerformanceArc
                            radius={radius}
                            value={gaugeData.value}
                            startAngle={startAngleRad}
                            thickness={settings.thickness}
                            color={performanceColor}
                            scale={scale}
                        />
                    )}
                    
                    {settings.showValueMarker && (
                        <ValueMarker
                            radius={radius}
                            value={gaugeData.value}
                            thickness={settings.thickness}
                            markerSize={settings.markerSize}
                            markerColor={settings.markerColor}
                            markerStyle={settings.markerStyle}
                            scale={scale}
                        />
                    )}
                    
                    {settings.showValueLabel && (
                        <CenterText
                            value={gaugeData.value}
                            fontSize={settings.fontSize}
                            fontFamily={settings.fontFamily}
                            color={settings.labelColor}
                            displayUnits={settings.displayUnits}
                            dataFormat={gaugeData.dataFormat}
                        />
                    )}
                </g>
            </svg>
        );
    }
}
