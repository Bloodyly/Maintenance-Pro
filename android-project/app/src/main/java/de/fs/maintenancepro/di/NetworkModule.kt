package de.fs.maintenancepro.di

import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import de.fs.maintenancepro.data.remote.ApiService
import de.fs.maintenancepro.data.remote.CryptoInterceptor
import de.fs.maintenancepro.ui.viewmodel.ActiveSessionManager
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import java.util.concurrent.TimeUnit
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object NetworkModule {

    @Provides
    @Singleton
    fun provideCryptoInterceptor(
        sessionManager: ActiveSessionManager
    ): CryptoInterceptor {
        return CryptoInterceptor {
            sessionManager.getActiveCredentials()
        }
    }

    @Provides
    @Singleton
    fun provideOkHttpClient(
        cryptoInterceptor: CryptoInterceptor
    ): OkHttpClient {
        val logging = HttpLoggingInterceptor().apply {
            level = HttpLoggingInterceptor.Level.BODY
        }
        return OkHttpClient.Builder()
            .addInterceptor(cryptoInterceptor)
            .addInterceptor(logging)
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(15, TimeUnit.SECONDS)
            .build()
    }

    @Provides
    @Singleton
    fun provideRetrofit(
        okHttpClient: OkHttpClient,
        sessionManager: ActiveSessionManager
    ): Retrofit {
        val baseUrlObj = sessionManager.getActiveBaseUrl() // e.g. "https://field-service.corp.internal:8443/"
        return Retrofit.Builder()
            .baseUrl(baseUrlObj)
            .client(okHttpClient)
            .addConverterFactory(GsonConverterFactory.create())
            .build()
    }

    @Provides
    @Singleton
    fun provideApiService(retrofit: Retrofit): ApiService {
        return retrofit.create(ApiService::class.java)
    }
}
