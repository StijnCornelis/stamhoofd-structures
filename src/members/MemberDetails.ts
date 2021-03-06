import { ArrayDecoder,AutoEncoder, BooleanDecoder,DateDecoder,EnumDecoder,field, IntegerDecoder,StringDecoder } from '@simonbackx/simple-encoding';

import { Address } from '../Address';
import { Group } from '../Group';
import { GroupGenderType } from '../GroupGenderType';
import { EmergencyContact } from './EmergencyContact';
import { Gender } from './Gender';
import { Parent } from './Parent';
import { Record } from './Record';

// Everything in this file is stored encrypted

export class MemberExistingStatus extends AutoEncoder {
    /**
     * Whether this member is new or not
     */
    @field({ decoder: BooleanDecoder })
    isNew: boolean

    /**
     * Whether this member has an existing brother/sister that was registered in the past year
     */
    @field({ decoder: BooleanDecoder })
    hasFamily: boolean

    @field({ decoder: DateDecoder })
    lastChanged: Date = new Date()

    isExpired() {
        return this.lastChanged <= new Date(new Date().getTime() - 60 * 1000 * 60 * 24 * 14)
    }
}

export class PreferredGroup extends AutoEncoder {
    @field({ decoder: StringDecoder })
    groupId: string

    /**
     * Cycle used, in order to invalidate old values
     */
    @field({ decoder: IntegerDecoder })
    cycle: number

    @field({ decoder: BooleanDecoder })
    waitingList = false
}
/**
 * This full model is always encrypted before sending it to the server. It is never processed on the server - only in encrypted form. 
 * The public key of the member is stored in the member model, the private key is stored in the keychain for the 'owner' users. The organization has a copy that is encrypted with the organization's public key.
 * Validation needs to happen mostly client side - but malicious users can just send invalid data in the encrypted form. So validation happens a second time on the client side when an organitiona's admin decrypts the member data.
 */
export class MemberDetails extends AutoEncoder {
    @field({ decoder: StringDecoder })
    firstName = "";

    @field({ decoder: StringDecoder })
    lastName = "";

    @field({ decoder: new EnumDecoder(Gender) })
    gender: Gender = Gender.Other;

    @field({ decoder: StringDecoder, nullable: true })
    phone: string | null = null;

    @field({ decoder: StringDecoder, nullable: true, field: "mail" })
    @field({ decoder: StringDecoder, nullable: true, version: 5 })
    email: string | null = null;

    @field({ decoder: DateDecoder })
    birthDay: Date = new Date("1970-01-01");

    @field({ decoder: Address, nullable: true })
    address: Address | null = null;

    @field({ decoder: new ArrayDecoder(Parent)})
    parents: Parent[] = [];

    @field({ decoder: new ArrayDecoder(EmergencyContact) })
    emergencyContacts: EmergencyContact[] = [];

    @field({ decoder: new ArrayDecoder(Record) })
    records: Record[] = [];

    @field({ decoder: EmergencyContact, nullable: true })
    doctor: EmergencyContact | null = null;

    /**
     * Last time the records were reviewed
     */
    @field({ decoder: DateDecoder, nullable: true, version: 20 })
    lastReviewed: Date | null = null;

    /**
     * Contains the group that was selected during member creation or editing. Used to determine the group to register the member in.
     * This can get cleared after registration, but is not needed since we keep track of the group cycle.
     */
    @field({ decoder: StringDecoder, version: 4, nullable: true, upgrade: () => null, field: "preferredGroupId" })
    @field({ decoder: new ArrayDecoder(PreferredGroup), version: 17, upgrade: (preferredGroupId: string | null) => {
        if (preferredGroupId === null) {
            return []
        }
        return [
            PreferredGroup.create({
                groupId: preferredGroupId,
                cycle: 0,
                waitingList: false
            })
        ]
    } })
    preferredGroups: PreferredGroup[] = []

    /**
     * During registration, we sometimes need to know if it is an existing member, new member or a broter/sister of an existing member.
     * We don't ask this information if it is not needed or when we can calculate it automatically based on the member history 
     * (this behaviour is determined by the shouldKnowExisting method of Group)
     * We also keep the date that this was asked, in order to invalidate the response in the future.
     */
    @field({ decoder: MemberExistingStatus, nullable: true, version: 18 })
    existingStatus: MemberExistingStatus | null = null

    /**
     * Set to true when this is automatically generated because we don't have the data
     */
    private _isPlaceholder = false

    get isPlaceholder() {
        return this._isPlaceholder
    }

    setPlaceholder() {
        this._isPlaceholder = true
    }

    get name() {
        return this.firstName + " " + this.lastName;
    }

    /// The age this member will become, this year
    ageForYear(year: number) {
        return year - this.birthDay.getFullYear();
    }

    get age() {
        const today = new Date();
        let age = today.getFullYear() - this.birthDay.getFullYear();
        const m = today.getMonth() - this.birthDay.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < this.birthDay.getDate())) {
            age--;
        }
        return age;
    }

    get birthDayFormatted() {
        const date = new Date(this.birthDay);
        const options = { year: "numeric", month: "long", day: "numeric" };
        return date.toLocaleDateString("nl-BE", options);
    }

    matchQuery(query: string): boolean {
        const lowerQuery = query.toLowerCase();
        if (
            this.firstName.toLowerCase().includes(lowerQuery) ||
            this.lastName.toLowerCase().includes(lowerQuery) ||
            this.name.toLowerCase().includes(lowerQuery)
        ) {
            return true;
        }
        return false;
    }

    /**
     * Check if this member could fit a group, ignoring dates and waiting lists
     */
    doesMatchGroup(group: Group) {
        if (group.settings.minAge || group.settings.maxAge) {
            
            const age = this.ageForYear(group.settings.startDate.getFullYear())
            if (group.settings.minAge && age < group.settings.minAge) {
                return false
            }

            if (group.settings.maxAge && age > group.settings.maxAge) {
                return false
            }
        }

        if (this.gender == Gender.Male && group.settings.genderType == GroupGenderType.OnlyFemale) {
            return false
        }

        if (this.gender == Gender.Female && group.settings.genderType == GroupGenderType.OnlyMale) {
            return false
        }
        
        return true
    }

    getMatchingGroups(groups: Group[]) {
        return groups.filter(g => this.doesMatchGroup(g))
    }

    updateAddress(oldValue: Address, newValue: Address) {
        const str = oldValue.toString()

        if (this.address && this.address.toString() == str) {
            this.address = newValue
        }

        for (const parent of this.parents) {
            if (parent.address && parent.address.toString() == str) {
                parent.address = newValue
            }
        }
    }

    updateParent(parent: Parent) {
        for (const [index, _parent] of this.parents.entries()) {
            if (_parent.id == parent.id) {
                this.parents[index] = parent
            }
        }
    }
}