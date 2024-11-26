/// <reference lib="webworker" />
import { firstValueFrom } from 'rxjs';
import {
    AdvancedProgramLabel,
    Current,
    CurrentUnit,
    CurrentUnits,
    ProgramBehaviorAPI,
    ProgramBehaviors,
    registerProgramBehavior,
    ScriptBuilder,
    SignalAnalogDomainValueEnum,
    SignalDirectionEnum,
    SignalValueTypeEnum,
    ValidationResponse,
    Voltage,
    VoltageUnit,
    VoltageUnits,
} from '@universal-robots/contribution-api';
import { SampleSetNode } from './set.node';

const behaviors: ProgramBehaviors<SampleSetNode> = {
    factory: (): SampleSetNode => {
        return {
            type: 'ur-sample-node-set',
            version: '0.0.3',
            allowsChildren: false,
            parameters: {
                signalOutput: {},
            },
        };
    },
    async programNodeLabel(node: SampleSetNode): Promise<AdvancedProgramLabel> {
        if (node.parameters.signalOutput) {
            const signalOutput = node.parameters.signalOutput;
            const groupID = signalOutput.groupId;
            const sourceID = signalOutput.sourceID;
            const signalID = signalOutput.signalID;
            const value = signalOutput.value;
            if (groupID && sourceID && signalID && value !== undefined) {
                const api = new ProgramBehaviorAPI(self);
                const signals = await api.sourceService.getSignals(sourceID);
                const signal = signals.find((s) => s.signalID === signalOutput.signalID);
                const signalName = signal?.name ?? signalID;
                if (signal?.valueType === SignalValueTypeEnum.BOOLEAN) {
                    return [
                        { type: 'primary', value: `${signalName} = ` },
                        { type: 'secondary', value: `${value ? 'HI' : 'LO'}` },
                    ];
                } else if (signal?.valueType === SignalValueTypeEnum.REGISTER) {
                    return [
                        { type: 'primary', value: `${signalName} = ` },
                        { type: 'secondary', value: `${value}` },
                    ];
                } else if (signal?.valueType === SignalValueTypeEnum.FLOAT) {
                    if (typeof value === 'number') {
                        return [
                            { type: 'primary', value: `${signalName} = ` },
                            { type: 'secondary', value: `${value}` },
                        ];
                    } else {
                        // Support legacy analog signals from wired-io and tool-io
                        return [
                            { type: 'primary', value: `${signalName} = ` },
                            {
                                type: 'secondary',
                                value: `${(value as Current | Voltage).value.toFixed(1)} ${(value as Voltage | Current).unit}`,
                            },
                        ];
                    }
                }
            } else if (signalID) {
                return [{ type: 'primary', value: `${signalID}` }];
            }
        }
        return [{ type: 'primary', value: '' }];
    },
    validator: async (node: SampleSetNode): Promise<ValidationResponse> => {
        const signalOutput = node.parameters.signalOutput;
        if (!signalOutput?.sourceID || !signalOutput.signalID || signalOutput.value === undefined) {
            return { isValid: false };
        }
        const api = new ProgramBehaviorAPI(self);
        if (typeof signalOutput.value !== 'boolean' && typeof signalOutput.value !== 'number') {
            const domains = await api.sourceService.getAnalogSignalDomains(signalOutput.sourceID);
            const currentDomain = domains[signalOutput.signalID];
            return { isValid: isUnitOfDomain(signalOutput.value.unit, currentDomain) };
        }
        const signals = await api.sourceService.getSignals(signalOutput.sourceID);
        const signal = signals.find((s) => s.signalID === signalOutput.signalID);
        if (!signal) {
            return { isValid: false, errorMessageKey: 'Signal not found' };
        }
        if (signal.direction !== SignalDirectionEnum.OUT) {
            return { isValid: false, errorMessageKey: 'Signal must be an output signal' };
        }
        if (signal.valueType !== node.parameters.signalOutput?.signalValueType) {
            return { isValid: false, errorMessageKey: 'Signal value type does not match' };
        }

        return { isValid: true };
    },
    generateCodeBeforeChildren: async (node: SampleSetNode): Promise<ScriptBuilder> => {
        const api = new ProgramBehaviorAPI(self);
        const signalOutput = node.parameters.signalOutput;
        const builder = new ScriptBuilder();
        if (!signalOutput?.groupId || !signalOutput?.sourceID || !signalOutput.signalID || signalOutput.value === undefined) {
            return builder;
        }
        const script = await api.sourceService.getSetSignalScript(
            signalOutput.groupId,
            signalOutput.sourceID,
            signalOutput.signalID,
            signalOutput.value,
        );
        builder.addRaw(script);
        return builder;
    },
    upgradeNode: async (loadedNode) => {
        if (loadedNode.version === '0.0.1') {
            loadedNode.version = '0.0.2';
            delete (loadedNode.parameters as any).type;
        }
        if (loadedNode.version === '0.0.2' && loadedNode.parameters.signalOutput) {
            loadedNode.version = '0.0.3';
            // Check if the value matches the valueType of the signal - if yes, set the signalValueType
            const { groupId, sourceID, signalID, value } = loadedNode.parameters.signalOutput;
            if (groupId && sourceID && signalID) {
                const api = new ProgramBehaviorAPI(self);
                const signalValueType = (await firstValueFrom(api.sourceService.sourceSignals(groupId, sourceID)))?.find(
                    (signal) => signal.signalID === signalID,
                )?.valueType;
                if (
                    (signalValueType === SignalValueTypeEnum.FLOAT && ((value as Current | Voltage)?.value || typeof value === 'number')) ||
                    (signalValueType === SignalValueTypeEnum.BOOLEAN && typeof value === 'boolean') ||
                    (signalValueType === SignalValueTypeEnum.REGISTER && typeof value === 'number' && parseInt(value.toString()) === value)
                ) {
                    loadedNode.parameters.signalOutput.signalValueType = signalValueType;
                }
            }
        }
        return loadedNode;
    },
};

const isUnitOfDomain = (unit: CurrentUnit | VoltageUnit, domain: SignalAnalogDomainValueEnum) => {
    if ((CurrentUnits as readonly string[]).includes(unit) && domain === SignalAnalogDomainValueEnum.CURRENT) {
        return true;
    }
    return (VoltageUnits as readonly string[]).includes(unit) && domain === SignalAnalogDomainValueEnum.VOLTAGE;
};

registerProgramBehavior(behaviors);
