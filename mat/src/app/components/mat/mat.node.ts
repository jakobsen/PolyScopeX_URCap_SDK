import { ApplicationNode } from '@universal-robots/contribution-api';

export interface MatNode extends ApplicationNode {
  type: string;
  version: string;
}
