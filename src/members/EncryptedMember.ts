import { AutoEncoder, BooleanDecoder,field, StringDecoder } from '@simonbackx/simple-encoding';
import { v4 as uuidv4 } from "uuid";

export class EncryptedMember extends AutoEncoder {
    @field({ decoder: StringDecoder, defaultValue: () => uuidv4() })
    id: string;

    @field({ decoder: StringDecoder, version: 20, upgrade: () => 'Onbekend' })
    firstName = ""

    @field({ decoder: StringDecoder, nullable: true })
    encryptedForOrganization: string | null

    @field({ decoder: StringDecoder, nullable: true })
    encryptedForMember: string | null

    @field({ decoder: StringDecoder })
    publicKey: string

    @field({ decoder: BooleanDecoder, version: 20 })
    placeholder = false
}

export const EncryptedMemberPatch = EncryptedMember.patchType()