import StorageManager from './StorageManager';

export interface Contact {
    id: string;
    name: string;
    address: string;
    createdAt: number;
}

export class ContactManager {
    private storageManager: StorageManager;
    private CONTACTS_KEY = "arfhe_contacts";

    constructor(storageManager: StorageManager) {
        this.storageManager = storageManager;
    }

    getContacts(): Contact[] {
        const contacts = this.storageManager.getLocal<Contact[]>(this.CONTACTS_KEY);
        return contacts || [];
    }

    addContact(name: string, address: string): Contact {
        const contacts = this.getContacts();

        // Check if address already exists
        const existing = contacts.find(c => c.address.toLowerCase() === address.toLowerCase());
        if (existing) {
            throw new Error("A contact with this address already exists.");
        }

        const newContact: Contact = {
            id: crypto.randomUUID(),
            name,
            address,
            createdAt: Date.now()
        };

        contacts.push(newContact);
        this.storageManager.setLocal(this.CONTACTS_KEY, contacts);
        return newContact;
    }

    updateContact(id: string, name: string, address: string): void {
        const contacts = this.getContacts();
        const index = contacts.findIndex(c => c.id === id);
        if (index === -1) throw new Error("Contact not found.");

        contacts[index].name = name;
        contacts[index].address = address;
        this.storageManager.setLocal(this.CONTACTS_KEY, contacts);
    }

    removeContact(id: string): void {
        const contacts = this.getContacts();
        const newContacts = contacts.filter(c => c.id !== id);
        this.storageManager.setLocal(this.CONTACTS_KEY, newContacts);
    }
}
