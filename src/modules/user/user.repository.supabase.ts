// src/modules/user/user.repository.supabase.ts
// Supabase implementation of the User repository.
// Maps to the public.users table which mirrors auth.users.
// Created/updated on first login via Supabase Auth.

import { SupabaseRepository } from '@/shared/classes/supabase.repository';
import { User } from './user.model';
import { RepositoryError } from '@/shared/errors/custom.error';

export class UserRepositorySupabase extends SupabaseRepository<User> {
  constructor() {
    super('users');
  }

  /**
   * findByEmail — finds a user by email address.
   * Used during OAuth login to check if the user already exists.
   */
  async findByEmail(email: string): Promise<User | null> {
    const { data, error } = await this.client()
      .from('users')
      .select('*')
      .eq('email', email.toLowerCase().trim())
      .is('deleted_at', null)
      .single();

    if (error?.code === 'PGRST116') return null;
    if (error) {
      throw new RepositoryError(
        `Error finding user by email: ${error.message}`,
        500,
      );
    }

    return this.mapRowToEntity(data as Record<string, unknown>);
  }

  /**
   * upsertFromAuth — creates or updates a user record from Supabase Auth data.
   * Called on every Google OAuth login to keep name/picture current.
   */
  async upsertFromAuth(
    id: string,
    email: string,
    name?: string,
    picture?: string,
  ): Promise<User> {
    const now = new Date().toISOString();

    const { data, error } = await this.client()
      .from('users')
      .upsert(
        {
          id,
          email: email.toLowerCase().trim(),
          name: name || null,
          picture: picture || null,
          updated_at: now,
          created_at: now,
          deleted_at: null,
        },
        { onConflict: 'id' },
      )
      .select()
      .single();

    if (error) {
      throw new RepositoryError(
        `Error upserting user from auth: ${error.message}`,
        500,
      );
    }

    return this.mapRowToEntity(data as Record<string, unknown>);
  }

  /**
   * findById — returns a user by ID.
   */
  async findById(id: string): Promise<User | null> {
    const { data, error } = await this.client()
      .from('users')
      .select('*')
      .eq('id', id)
      .is('deleted_at', null)
      .single();

    if (error?.code === 'PGRST116') return null;
    if (error) {
      throw new RepositoryError(`Error finding user: ${error.message}`, 500);
    }

    return this.mapRowToEntity(data as Record<string, unknown>);
  }

  /**
   * updateProfile — updates a user's name and picture.
   */
  async updateProfile(
    id: string,
    name: string,
    picture?: string,
  ): Promise<User | null> {
    const now = new Date().toISOString();

    const { data, error } = await this.client()
      .from('users')
      .update({
        name,
        picture: picture || null,
        updated_at: now,
      })
      .eq('id', id)
      .is('deleted_at', null)
      .select()
      .single();

    if (error?.code === 'PGRST116') return null;
    if (error) {
      throw new RepositoryError(
        `Error updating user profile: ${error.message}`,
        500,
      );
    }

    return this.mapRowToEntity(data as Record<string, unknown>);
  }

  /**
   * softDelete — soft-deletes a user (marks as deleted, does not remove from auth).
   */
  async softDelete(id: string): Promise<boolean> {
    if (!id) {
      throw new RepositoryError('ID is required', 400);
    }

    const { error } = await this.client()
      .from('users')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', id)
      .is('deleted_at', null);

    if (error) {
      throw new RepositoryError(
        `Error soft deleting user: ${error.message}`,
        500,
      );
    }

    return true;
  }
}