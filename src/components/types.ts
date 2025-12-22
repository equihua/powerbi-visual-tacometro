export interface DataFormat {
    decimalPlaces: number | null;
    isPercentage: boolean;
}

export interface GaugeData {
    value: number;
    min: number;
    max: number;
    lowThreshold: number;
    midThreshold: number;
    hasValidData: boolean;
    dataFormat: DataFormat;
}

export interface GaugeSettings {
    thickness: number;
    startAngle: number;
    endAngle: number;
    showRanges: boolean;
    lowColor: string;
    mediumColor: string;
    highColor: string;
    showValueMarker: boolean;
    markerSize: number;
    markerColor: string;
    markerStyle: any;
    showValueLabel: boolean;
    fontSize: number;
    fontFamily: string;
    labelColor: string;
    displayUnits: number;
}

export interface MarkerProps {
    radius: number;
    value: number;
    scale: (value: number) => number;
    settings: {
        size: number;
        color: string;
        style: string;
        thickness: number;
    };
}
